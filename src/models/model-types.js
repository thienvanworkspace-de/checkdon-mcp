import { Customer } from "./customer.js";
import { Product } from "./product.js";
import { Accountant } from "./accountant.js";
import { CustomerFeature } from "./customer-feature.js";
import { SpecificPrice } from "./specific-price.js";
import { SpecificPromotion } from "./specific-promotion.js";
import { ProgramPromotion } from "./program-promotion.js";
import { ProductLot } from "./product-lot.js";
import { HospitalPrice } from "./hospital-price.js";
import { Order } from "./order.js";
import { OrderOk } from "./order-ok.js";
import { OrderProjection } from "./order-projection.js";
import { SyncCursor } from "./sync-cursor.js";

// Thêm model mới vào registry này; factory không cần biết nội dung các trường.
export const modelTypes = [Customer, Product, Accountant, CustomerFeature, SpecificPrice, SpecificPromotion, ProgramPromotion, ProductLot, HospitalPrice, Order, OrderOk, OrderProjection, SyncCursor];
