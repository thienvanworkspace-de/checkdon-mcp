import { Sequelize } from "sequelize";

/** Tạo connection pool, chỉ authenticate khi runtime chủ động khởi động. */
export function createSequelize({ databaseConfig }) {
    const { name, username, password, host, port, ca, tls = true } = databaseConfig;
    const missing = Object.entries({ DB_NAME: name, DB_USERNAME: username, DB_HOST: host })
        .filter(([, value]) => !value).map(([key]) => key);
    if (password === undefined) missing.push("DB_PASSWORD");
    if (missing.length) throw new Error(`Thiếu cấu hình MySQL: ${missing.join(", ")}`);
    return new Sequelize(name, username, password, {
        host, port, dialect: "mysql", logging: false,
        pool: { max: 5, min: 0, acquire: 30_000, idle: 10_000 },
        dialectOptions: {
            connectTimeout: 10_000,
            ...(tls ? { ssl: { ...(ca ? { ca: ca.replace(/\\n/g, "\n") } : {}), rejectUnauthorized: true } } : {})
        }
    });
}
