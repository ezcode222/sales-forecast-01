-- Convert forecast period from NVARCHAR to DATE.
-- Month granularity: YYYY-MM -> first day of month.
-- Week granularity: YYYY-MM-DD -> keep the anchor date.

IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[dbo].[forecast_values]')
    AND name = N'period'
    AND system_type_id = TYPE_ID(N'nvarchar')
)
BEGIN
  ALTER TABLE [dbo].[forecast_values] DROP CONSTRAINT [forecast_values_pkey];
  ALTER TABLE [dbo].[forecast_values] ADD [periodDate] DATE NULL;

  EXEC(N'
    UPDATE [dbo].[forecast_values]
    SET [periodDate] = CASE
      WHEN [granularity] = N''month'' AND LEN([period]) = 7
        THEN DATEFROMPARTS(
          CAST(LEFT([period], 4) AS INT),
          CAST(SUBSTRING([period], 6, 2) AS INT),
          1
        )
      WHEN LEN([period]) = 10
        THEN TRY_CONVERT(DATE, [period], 23)
      ELSE TRY_CONVERT(DATE, CONCAT([period], N''-01''), 126)
    END;
  ');

  ALTER TABLE [dbo].[forecast_values] DROP COLUMN [period];
  EXEC sp_rename N'dbo.forecast_values.periodDate', N'period', N'COLUMN';
  ALTER TABLE [dbo].[forecast_values] ALTER COLUMN [period] DATE NOT NULL;

  ALTER TABLE [dbo].[forecast_values]
  ADD CONSTRAINT [forecast_values_pkey]
    PRIMARY KEY CLUSTERED ([registrationId], [versionName], [period]);
END;

IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[dbo].[forecast_change_logs]')
    AND name = N'period'
    AND system_type_id = TYPE_ID(N'nvarchar')
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'forecast_change_logs_registration_period_idx'
      AND object_id = OBJECT_ID(N'[dbo].[forecast_change_logs]')
  )
  BEGIN
    DROP INDEX [forecast_change_logs_registration_period_idx] ON [dbo].[forecast_change_logs];
  END;

  ALTER TABLE [dbo].[forecast_change_logs] ADD [periodDate] DATE NULL;

  EXEC(N'
    UPDATE [dbo].[forecast_change_logs]
    SET [periodDate] = CASE
      WHEN [granularity] = N''month'' AND LEN([period]) = 7
        THEN DATEFROMPARTS(
          CAST(LEFT([period], 4) AS INT),
          CAST(SUBSTRING([period], 6, 2) AS INT),
          1
        )
      WHEN LEN([period]) = 10
        THEN TRY_CONVERT(DATE, [period], 23)
      ELSE TRY_CONVERT(DATE, CONCAT([period], N''-01''), 126)
    END;
  ');

  ALTER TABLE [dbo].[forecast_change_logs] DROP COLUMN [period];
  EXEC sp_rename N'dbo.forecast_change_logs.periodDate', N'period', N'COLUMN';
  ALTER TABLE [dbo].[forecast_change_logs] ALTER COLUMN [period] DATE NOT NULL;

  CREATE NONCLUSTERED INDEX [forecast_change_logs_registration_period_idx]
  ON [dbo].[forecast_change_logs]([registrationId], [versionName], [period]);
END;

EXEC(N'
CREATE OR ALTER VIEW [dbo].[FactForecast] AS
WITH fact_base AS (
  SELECT
    forecast.[registrationId],
    forecast.[versionName],
    forecast.[period],
    forecast.[granularity],
    forecast.[qtyFcst],
    forecast.[priceFcst],
    forecast.[updatedAt],
    forecast.[lastBatchId],
    versions.[versionKey],
    batch.[changedBy],
    batch.[stampPeriod],
    batch.[createdAt] AS [batchCreatedAt],
    ISNULL(managed.[priceFormula], N''CPL'') AS [priceFormula],
    ISNULL(managed.[spread], 0) AS [spread],
    cpl.[price] AS [cplPrice]
  FROM [dbo].[forecast_values] forecast
  INNER JOIN [dbo].[forecast_versions] versions
    ON versions.[name] = forecast.[versionName]
  LEFT JOIN [dbo].[forecast_commit_batches] batch
    ON batch.[id] = forecast.[lastBatchId]
  LEFT JOIN [dbo].[master_data_crm_registrations] managed
    ON managed.[id] = forecast.[registrationId]
    OR managed.[newKey] = forecast.[registrationId]
  LEFT JOIN [dbo].[cpl_prices] cpl
    ON cpl.[month] = FORMAT(forecast.[period], ''yyyy-MM'')
),
resolved_fact AS (
  SELECT
    *,
    COALESCE([batchCreatedAt], [updatedAt]) AS [revisionDate],
    COALESCE(NULLIF([changedBy], N''''), N''sales-forecast-web'') AS [revisionUser],
    COALESCE(NULLIF([stampPeriod], N''''), N''No'') AS [resolvedStampPeriod],
    DATEFROMPARTS(YEAR([period]), MONTH([period]), 1) AS [fcstPeriodDate],
    CASE
      WHEN [priceFormula] = N''Fixed Price'' THEN ISNULL([priceFcst], 0)
      WHEN [priceFormula] IN (N''Naphtha'', N''Benzene'') THEN ISNULL([priceFcst], 0)
      ELSE ISNULL([cplPrice], 0) + ISNULL([spread], 0)
    END AS [effectivePrice]
  FROM fact_base
)
SELECT
  CONCAT(
    CAST([versionKey] AS NVARCHAR(20)),
    N''-'',
    CONVERT(CHAR(10), [revisionDate], 105),
    N''-'',
    REPLACE(CONVERT(CHAR(5), [revisionDate], 108), N'':'', N''''),
    N''-'',
    [revisionUser]
  ) AS [Fcst Rev Key],
  CONCAT(
    CONVERT(CHAR(10), [revisionDate], 105),
    N''-'',
    REPLACE(CONVERT(CHAR(5), [revisionDate], 108), N'':'', N''''),
    N''-'',
    [revisionUser]
  ) AS [Revision],
  [versionName] AS [Forecast Version],
  [versionKey] AS [Version Key],
  [registrationId] AS [Registration Key],
  [fcstPeriodDate] AS [Fcst Period],
  CAST([qtyFcst] AS DECIMAL(18,4)) AS [NewQty],
  CAST([effectivePrice] AS DECIMAL(18,4)) AS [Price],
  CAST([qtyFcst] * [effectivePrice] AS DECIMAL(18,4)) AS [Amount],
  [resolvedStampPeriod] AS [Stamp Period]
FROM resolved_fact;
');
