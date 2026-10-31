import { asClass, asValue, asFunction } from "awilix";
import { loadBusinessConfig } from "../config/business-config.js";
import { BusinessGateway } from "./services/business-gateway.js";
import { InvoiceApplicationService } from "./services/invoice-application-service.js";
import { OrderApplicationService } from "./services/order-application-service.js";
import { BusinessExecutorFactory } from "./factories/business-executor-factory.js";
import { UseCaseFactory } from "./factories/use-case-factory.js";
import { CheckOrder } from "./use-cases/check-order.js";
import { CheckInvoice } from "./use-cases/check-invoice.js";
import { CreateOrder } from "./use-cases/create-order.js";
import { UpdateOrderContent } from "./use-cases/update-order-content.js";
import { NodeBusinessExecutor } from "../infrastructure/business/node-business-executor.js";
import { StoredProcedureExecutor } from "../infrastructure/business/stored-procedure-executor.js";
import { HttpBusinessExecutor } from "../infrastructure/business/http-business-executor.js";
import { RequestContext } from "../infrastructure/context/request-context.js";
import { InvoiceService } from "../business/invoice-service.js";
import { OrderService } from "../business/order-service.js";

/** Đăng ký module business tại composition root; không dùng service locator trong nghiệp vụ. */
export function registerBusiness(container, config) {
    container.register({
        businessConfig: asValue(config.business ?? loadBusinessConfig()),
        requestContext: asClass(RequestContext).singleton(),
        invoiceRules: asClass(InvoiceService).singleton(), orderRules: asClass(OrderService).singleton(),
        invoiceService: asClass(InvoiceApplicationService).singleton(), orderService: asClass(OrderApplicationService).singleton(),
        checkOrderUseCase: asClass(CheckOrder).singleton(), checkInvoiceUseCase: asClass(CheckInvoice).singleton(),
        createOrderUseCase: asClass(CreateOrder).singleton(), updateOrderContentUseCase: asClass(UpdateOrderContent).singleton(),
        useCaseFactory: asFunction(cradle => new UseCaseFactory({
            "orders.check": () => cradle.checkOrderUseCase, "invoices.check": () => cradle.checkInvoiceUseCase,
            "orders.create": () => cradle.createOrderUseCase, "orders.updateContent": () => cradle.updateOrderContentUseCase
        })).singleton(),
        nodeBusinessExecutor: asClass(NodeBusinessExecutor).singleton(),
        procedureBusinessExecutor: asClass(StoredProcedureExecutor).singleton(),
        httpBusinessExecutor: asFunction(({ businessConfig }) => new HttpBusinessExecutor({ businessConfig })).singleton(),
        businessExecutorFactory: asFunction(cradle => new BusinessExecutorFactory({
            node: () => cradle.nodeBusinessExecutor,
            procedure: () => cradle.procedureBusinessExecutor,
            http: () => cradle.httpBusinessExecutor
        })).singleton(),
        businessGateway: asClass(BusinessGateway).singleton()
    });
}
