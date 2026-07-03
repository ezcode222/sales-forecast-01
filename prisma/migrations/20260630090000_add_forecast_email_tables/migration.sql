CREATE TABLE [dbo].[hr_employee_cache] (
    [empCode] NVARCHAR(50) NOT NULL,
    [fullNameEng] NVARCHAR(200) NOT NULL CONSTRAINT [hr_employee_cache_fullNameEng_df] DEFAULT N'',
    [currentEmail] NVARCHAR(320) NOT NULL CONSTRAINT [hr_employee_cache_currentEmail_df] DEFAULT N'',
    [costCenterEng] NVARCHAR(300) NOT NULL CONSTRAINT [hr_employee_cache_costCenterEng_df] DEFAULT N'',
    [adLoginName] NVARCHAR(200) NOT NULL CONSTRAINT [hr_employee_cache_adLoginName_df] DEFAULT N'',
    [syncedAt] DATETIME2 NOT NULL CONSTRAINT [hr_employee_cache_syncedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [hr_employee_cache_pkey] PRIMARY KEY CLUSTERED ([empCode])
);

CREATE NONCLUSTERED INDEX [hr_employee_cache_fullNameEng_idx]
ON [dbo].[hr_employee_cache]([fullNameEng]);

CREATE NONCLUSTERED INDEX [hr_employee_cache_costCenterEng_idx]
ON [dbo].[hr_employee_cache]([costCenterEng]);

CREATE TABLE [dbo].[forecast_cc_recipients] (
    [id] NVARCHAR(36) NOT NULL,
    [empCode] NVARCHAR(50) NOT NULL,
    [fullNameEng] NVARCHAR(200) NOT NULL CONSTRAINT [forecast_cc_recipients_fullNameEng_df] DEFAULT N'',
    [currentEmail] NVARCHAR(320) NOT NULL CONSTRAINT [forecast_cc_recipients_currentEmail_df] DEFAULT N'',
    [notifyEnabled] BIT NOT NULL CONSTRAINT [forecast_cc_recipients_notifyEnabled_df] DEFAULT 1,
    [source] NVARCHAR(20) NOT NULL CONSTRAINT [forecast_cc_recipients_source_df] DEFAULT N'manual',
    [sortOrder] INT NOT NULL CONSTRAINT [forecast_cc_recipients_sortOrder_df] DEFAULT 0,
    CONSTRAINT [forecast_cc_recipients_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [forecast_cc_recipients_empCode_key] UNIQUE NONCLUSTERED ([empCode])
);

CREATE TABLE [dbo].[forecast_notification_send_log] (
    [id] NVARCHAR(36) NOT NULL,
    [empCode] NVARCHAR(50) NULL,
    [email] NVARCHAR(320) NOT NULL,
    [recipientKind] NVARCHAR(20) NOT NULL,
    [ownerName] NVARCHAR(200) NULL,
    [commitBatchId] NVARCHAR(36) NULL,
    [sentAt] DATETIME2 NOT NULL CONSTRAINT [forecast_notification_send_log_sentAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [forecast_notification_send_log_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [forecast_notification_send_log_email_idx]
ON [dbo].[forecast_notification_send_log]([email]);

CREATE NONCLUSTERED INDEX [forecast_notification_send_log_commitBatchId_idx]
ON [dbo].[forecast_notification_send_log]([commitBatchId]);
