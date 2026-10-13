-- ========================================================
-- CloudPanel MySQL / phpMyAdmin Schema
-- Telegram Payment Gateway & Operator Dashboard
-- Charset: utf8mb4 (Full Unicode / Bengali Support)
-- ========================================================

CREATE DATABASE IF NOT EXISTS `payment_gateway` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `payment_gateway`;

-- 1. Users & Operators Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(191) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'OPERATOR',
  `status` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  `created_at` BIGINT NULL,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Payment Requests Table
CREATE TABLE IF NOT EXISTS `payment_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `request_id` VARCHAR(191) NOT NULL UNIQUE,
  `payment_method` VARCHAR(50) NOT NULL,
  `wallet_number` VARCHAR(50) NOT NULL,
  `raw_wallet_number` VARCHAR(100) NULL,
  `amount` DOUBLE NOT NULL,
  `assigned_user` VARCHAR(100) NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  `transaction_id` VARCHAR(100) NULL,
  `completed_by` VARCHAR(100) NULL,
  `completed_by_user_id` VARCHAR(100) NULL,
  `completed_by_username` VARCHAR(100) NULL,
  `completed_at` BIGINT NULL,
  `created_at` BIGINT NOT NULL,
  `raw_message` MEDIUMTEXT NULL,
  `telegram_chat_id` VARCHAR(100) NULL,
  `telegram_message_id` VARCHAR(100) NULL,
  `reminder_sent` INT DEFAULT 0,
  `reminder_message_id` VARCHAR(100) NULL,
  INDEX `idx_payreq_status` (`status`),
  INDEX `idx_payreq_created` (`created_at`),
  INDEX `idx_payreq_tx` (`transaction_id`),
  INDEX `idx_payreq_chat` (`telegram_chat_id`),
  INDEX `idx_payreq_method` (`payment_method`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Audit Logs Table
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` VARCHAR(100) NULL,
  `action` VARCHAR(100) NULL,
  `details` MEDIUMTEXT NULL,
  `created_at` BIGINT NULL,
  INDEX `idx_audit_user` (`user_id`),
  INDEX `idx_audit_action` (`action`),
  INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Group Routing Rules Table
CREATE TABLE IF NOT EXISTS `routing_rules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `chat_id` VARCHAR(100) NOT NULL,
  `chat_name` VARCHAR(255) NULL,
  `min_amount` DOUBLE NOT NULL,
  `max_amount` DOUBLE NOT NULL,
  `payment_methods` VARCHAR(255) DEFAULT 'BKASH,NAGAD,ROCKET,UPAY',
  `is_active` INT DEFAULT 1,
  `daily_limit` DOUBLE DEFAULT 0,
  `created_at` BIGINT NULL,
  INDEX `idx_rules_chat` (`chat_id`),
  INDEX `idx_rules_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Group Balances Table
CREATE TABLE IF NOT EXISTS `group_balances` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `chat_id` VARCHAR(191) NOT NULL UNIQUE,
  `chat_name` VARCHAR(255) NULL,
  `balance` DOUBLE NOT NULL DEFAULT 0,
  `updated_at` BIGINT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Group Ledger Entries Table
CREATE TABLE IF NOT EXISTS `group_ledger_entries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `chat_id` VARCHAR(100) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `amount` DOUBLE NOT NULL,
  `balance_after` DOUBLE NOT NULL,
  `description` MEDIUMTEXT NULL,
  `reference_id` VARCHAR(100) NULL,
  `operator` VARCHAR(100) NULL,
  `created_at` BIGINT NOT NULL,
  INDEX `idx_ledger_chat` (`chat_id`),
  INDEX `idx_ledger_type` (`type`),
  INDEX `idx_ledger_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. System Settings Table
CREATE TABLE IF NOT EXISTS `system_settings` (
  `key` VARCHAR(191) PRIMARY KEY,
  `value` MEDIUMTEXT NOT NULL,
  `updated_at` BIGINT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
