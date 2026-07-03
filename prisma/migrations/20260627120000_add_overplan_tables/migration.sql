CREATE TABLE [dbo].[overplan_config] (
    [id] NVARCHAR(20) NOT NULL,
    [planVersionName] NVARCHAR(100) NOT NULL CONSTRAINT [overplan_config_planVersionName_df] DEFAULT N'BB FY26',
    [actualVsPlanEnabled] BIT NOT NULL CONSTRAINT [overplan_config_actualVsPlanEnabled_df] DEFAULT 1,
    [forecastVsPlanEnabled] BIT NOT NULL CONSTRAINT [overplan_config_forecastVsPlanEnabled_df] DEFAULT 0,
    [aboveEnabled] BIT NOT NULL CONSTRAINT [overplan_config_aboveEnabled_df] DEFAULT 1,
    [belowEnabled] BIT NOT NULL CONSTRAINT [overplan_config_belowEnabled_df] DEFAULT 1,
    [aboveThresholdTon] DECIMAL(18, 4) NULL,
    [aboveThresholdPercent] DECIMAL(8, 4) NULL,
    [belowThresholdTon] DECIMAL(18, 4) NULL,
    [belowThresholdPercent] DECIMAL(8, 4) NULL,
    [updatedBy] NVARCHAR(100) NOT NULL CONSTRAINT [overplan_config_updatedBy_df] DEFAULT N'system',
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [overplan_config_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [overplan_config_pkey] PRIMARY KEY CLUSTERED ([id])
);

INSERT INTO [dbo].[overplan_config] ([id])
VALUES (N'default');

CREATE TABLE [dbo].[overplan_recipients] (
    [id] NVARCHAR(36) NOT NULL,
    [reportType] NVARCHAR(30) NOT NULL,
    [email] NVARCHAR(320) NOT NULL,
    [displayName] NVARCHAR(200) NULL,
    [isActive] BIT NOT NULL CONSTRAINT [overplan_recipients_isActive_df] DEFAULT 1,
    [sortOrder] INT NOT NULL CONSTRAINT [overplan_recipients_sortOrder_df] DEFAULT 0,
    CONSTRAINT [overplan_recipients_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [overplan_recipients_reportType_isActive_idx]
ON [dbo].[overplan_recipients]([reportType], [isActive]);

INSERT INTO [dbo].[overplan_recipients] ([id], [reportType], [email], [displayName], [sortOrder])
VALUES
    (NEWID(), N'aggregate', N'taksaporn@ube.co.th', N'Taksaporn Poldongnok', 0),
    (NEWID(), N'non_aggregate', N'taksaporn@ube.co.th', N'Taksaporn Poldongnok', 0),
    (NEWID(), N'forecast_change', N'taksaporn@ube.co.th', N'Taksaporn Poldongnok', 0);
