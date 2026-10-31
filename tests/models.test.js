import test from "node:test";
import assert from "node:assert/strict";
import { Sequelize } from "sequelize";
import { createModels } from "../src/infrastructure/mysql/model-factory.js";
import { Customer } from "../src/models/customer.js";
import { Product } from "../src/models/product.js";
import { Order } from "../src/models/order.js";
import { OrderOk } from "../src/models/order-ok.js";

test("model có lớp riêng và mỗi container/connection giữ binding riêng", async () => {
    const first = new Sequelize("unused", "unused", "", { dialect: "mysql", logging: false });
    const second = new Sequelize("unused", "unused", "", { dialect: "mysql", logging: false });
    try {
        const a = createModels(first);
        const b = createModels(second);
        assert.ok(a.Customer.build({ code: "KH1", name: "Khách" }) instanceof Customer);
        assert.ok(a.Product.build({ code: "SP1", name: "Sản phẩm" }) instanceof Product);
        assert.ok(a.Order.build() instanceof Order);
        assert.ok(a.OrderOk.build() instanceof OrderOk);
        assert.notEqual(a.Customer, b.Customer);
        assert.equal(a.Customer.sequelize, first);
        assert.equal(b.Customer.sequelize, second);
        assert.equal(a.CustomerFeature.associations.Customer.target, a.Customer);
        assert.equal(b.CustomerFeature.associations.Customer.target, b.Customer);
        assert.deepEqual(Object.keys(a.Order.getAttributes()), Object.keys(a.OrderOk.getAttributes()));
    } finally { await Promise.all([first.close(), second.close()]); }
});
