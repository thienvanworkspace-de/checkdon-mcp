-- Generated schema for a NEW MySQL database; review before executing.

-- No automatic migration at startup. Existing legacy tables require a separate migration plan.

CREATE TABLE IF NOT EXISTS `customers` (`id` INTEGER NOT NULL auto_increment , `code` VARCHAR(100) NOT NULL UNIQUE, `name` VARCHAR(255) NOT NULL, `address` VARCHAR(255), `province` VARCHAR(255), `category` INTEGER, `hasFeatures` INTEGER, `isActive` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `products` (`id` INTEGER NOT NULL auto_increment , `code` VARCHAR(100) NOT NULL UNIQUE, `name` VARCHAR(255) NOT NULL, `unit` VARCHAR(255), `unitPrice` DECIMAL(15,2), `promotionPolicy` VARCHAR(255), `discountRate` DECIMAL(15,2), `isActive` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `accountants` (`id` INTEGER NOT NULL auto_increment , `name` VARCHAR(255), `email` VARCHAR(255) NOT NULL UNIQUE, `address` VARCHAR(255), `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `customer_features` (`id` INTEGER NOT NULL auto_increment , `customerId` INTEGER NOT NULL UNIQUE, `isPromoted` INTEGER, `nameOnGoodsIssueInvoice` VARCHAR(255), `addressOnGoodsIssueInvoice` VARCHAR(255), `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `specific_prices` (`id` INTEGER NOT NULL auto_increment , `customerId` INTEGER NOT NULL, `productId` INTEGER NOT NULL, `unitPrice` DECIMAL(15,2), `discountRate` DECIMAL(15,2), `promotionPolicy` VARCHAR(255), `isActive` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE, FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `specific_prices` ADD UNIQUE INDEX `specific_prices_customer_id_product_id` (`customerId`, `productId`);

CREATE TABLE IF NOT EXISTS `specific_promotions` (`id` INTEGER NOT NULL auto_increment , `customerId` INTEGER NOT NULL, `productId` INTEGER NOT NULL, `buy` INTEGER, `present` INTEGER, `isActive` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE, FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `specific_promotions` ADD UNIQUE INDEX `specific_promotions_customer_id_product_id` (`customerId`, `productId`);

CREATE TABLE IF NOT EXISTS `program_promotions` (`id` INTEGER NOT NULL auto_increment , `sourceKey` VARCHAR(100) NOT NULL UNIQUE, `promotionPolicy` VARCHAR(255), `productId` INTEGER, `fromDate` DATE, `toDate` DATE, `buy` INTEGER, `present` INTEGER, `isActive` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `product_lots` (`id` INTEGER NOT NULL auto_increment , `productId` INTEGER NOT NULL, `lotNumber` VARCHAR(100) NOT NULL, `expiryDate` VARCHAR(50) NOT NULL, `isActive` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `product_lots` ADD UNIQUE INDEX `product_lots_product_id_lot_number` (`productId`, `lotNumber`);

CREATE TABLE IF NOT EXISTS `hospital_prices` (`id` INTEGER NOT NULL auto_increment , `customerId` INTEGER NOT NULL, `productId` INTEGER NOT NULL, `unitPrice` DECIMAL(15,2), `discountRate` DECIMAL(15,2), `soldQuantity` DECIMAL(15,3), `isActive` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`customerId`) REFERENCES `customers` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE, FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `hospital_prices` ADD UNIQUE INDEX `hospital_prices_customer_id_product_id` (`customerId`, `productId`);

CREATE TABLE IF NOT EXISTS `orders` (`id` INTEGER NOT NULL auto_increment , `key` VARCHAR(191) NOT NULL UNIQUE, `content` TEXT NOT NULL, `receivedAt` DATETIME NOT NULL, `sheetDate` VARCHAR(255), `status` VARCHAR(255), `supplement` TEXT, `checked` JSON, `ordersChecked` JSON, `sheetFields` JSON, `projectedAt` DATETIME, `revision` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `orders_ok` (`id` INTEGER NOT NULL auto_increment , `key` VARCHAR(191) NOT NULL UNIQUE, `content` TEXT NOT NULL, `receivedAt` DATETIME NOT NULL, `sheetDate` VARCHAR(255), `status` VARCHAR(255), `supplement` TEXT, `checked` JSON, `ordersChecked` JSON, `sheetFields` JSON, `projectedAt` DATETIME, `revision` INTEGER NOT NULL DEFAULT 1, `sourceData` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `order_projections` (`orderKey` VARCHAR(191) , `revision` INTEGER NOT NULL, `payload` JSON NOT NULL, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`orderKey`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `sync_cursors` (`scope` VARCHAR(191) , `version` BIGINT NOT NULL DEFAULT 0, `payloadHash` VARCHAR(64), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, PRIMARY KEY (`scope`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_bin;
