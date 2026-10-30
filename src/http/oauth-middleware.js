import { createRemoteJWKSet, jwtVerify } from "jose";

/** Middleware xác thực; cấu hình và HTTP client được truyền vào để kiểm thử offline. */
export function createOAuthMiddleware({ config, fetchImpl = fetch, logger = console }) {
    const AUTHKIT_ISSUER = config.authkitIssuer;
    const MCP_RESOURCE_URL = config.mcpResourceUrl;
    const ALLOWED_EMAILS = new Set(config.allowedEmails);
    const JWKS = createRemoteJWKSet(new URL(`${AUTHKIT_ISSUER}/oauth2/jwks`));
    const RESOURCE_METADATA_URL = `${new URL(MCP_RESOURCE_URL).origin}/.well-known/oauth-protected-resource`;
    const WWW_AUTHENTICATE_HEADER = [
        'Bearer error="unauthorized"',
        'error_description="Authorization needed"',
        `resource_metadata="${RESOURCE_METADATA_URL}"`
    ].join(", ");

    return async (req, res, next) => {
        // 1. Lấy access token từ HTTP Authorization header
        const token = req.headers.authorization
            ?.match(/^Bearer\s+(.+)$/i)?.[1];

        if (!token) {
            res.setHeader(
                "WWW-Authenticate",
                WWW_AUTHENTICATE_HEADER
            );

            return res.status(401).json({
                error: "unauthorized",
                message: "Cần đăng nhập để sử dụng Check đơn."
            });
        }

        // 2. Xác minh chữ ký JWT, issuer, audience và hạn dùng
        let payload;

        try {
            ({ payload } = await jwtVerify(token, JWKS, {
                issuer: AUTHKIT_ISSUER,
                audience: MCP_RESOURCE_URL
            }));
        } catch (error) {
            logger.warn(
                "[AUTH] Token không hợp lệ:",
                error.code ?? error.message
            );

            res.setHeader(
                "WWW-Authenticate",
                WWW_AUTHENTICATE_HEADER
            );

            return res.status(401).json({
                error: "invalid_token",
                message: "Access token không hợp lệ hoặc đã hết hạn."
            });
        }

        if (typeof payload.sub !== "string") {
            return res.status(401).json({
                error: "invalid_token",
                message: "Token thiếu định danh người dùng."
            });
        }

        // 3. Lấy email từ WorkOS UserInfo endpoint.
        // Không tin email do GPT tự truyền trong JSON.
        let userInfo;

        try {
            const response = await fetchImpl(
                `${AUTHKIT_ISSUER}/oauth2/userinfo`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) {
                logger.error(
                    "[AUTH] UserInfo trả HTTP",
                    response.status
                );

                return res.status(502).json({
                    error: "identity_lookup_failed",
                    message: "Không xác minh được danh tính người dùng."
                });
            }

            userInfo = await response.json();
        } catch (error) {
            logger.error(
                "[AUTH] Không kết nối được UserInfo:",
                error.message
            );

            return res.status(502).json({
                error: "identity_lookup_failed",
                message: "Dịch vụ xác minh danh tính tạm thời không khả dụng."
            });
        }

        // 4. Chỉ chấp nhận email đã xác minh
        const email = typeof userInfo.email === "string"
            ? userInfo.email.trim().toLowerCase()
            : "";

        if (!email || userInfo.email_verified !== true) {
            return res.status(403).json({
                error: "email_not_verified",
                message: "Tài khoản chưa có email được xác minh."
            });
        }

        // 5. Kiểm tra danh sách email được phép
        if (!ALLOWED_EMAILS.has(email)) {
            logger.warn("[AUTH] Từ chối người dùng không được phép.");

            return res.status(403).json({
                error: "access_denied",
                message: "Tài khoản không được phép sử dụng Check đơn."
            });
        }

        // Danh tính đã kiểm chứng, dành cho phân quyền nghiệp vụ về sau.
        req.auth = { subject: payload.sub, email };
        return next();
    };
}
