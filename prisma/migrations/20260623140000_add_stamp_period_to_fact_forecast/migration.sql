IF COL_LENGTH('dbo.forecast_commit_batches', 'stampPeriod') IS NULL
BEGIN
  ALTER TABLE [dbo].[forecast_commit_batches]
  ADD [stampPeriod] NVARCHAR(30) NOT NULL
    CONSTRAINT [forecast_commit_batches_stampPeriod_df] DEFAULT N'No';
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
    cpl.[price] AS [cplPrice],
    COALESCE(
      TRY_CONVERT(DATE, forecast.[period]),
      TRY_CONVERT(DATE, CONCAT(CAST(forecast.[period] AS NVARCHAR(15)), N''-01''), 126)
    ) AS [periodDate]
  FROM [dbo].[forecast_values] forecast
  INNER JOIN [dbo].[forecast_versions] versions
    ON versions.[name] = forecast.[versionName]
  LEFT JOIN [dbo].[forecast_commit_batches] batch
    ON batch.[id] = forecast.[lastBatchId]
  LEFT JOIN [dbo].[master_data_crm_registrations] managed
    ON managed.[id] = forecast.[registrationId]
    OR managed.[newKey] = forecast.[registrationId]
  LEFT JOIN [dbo].[cpl_prices] cpl
    ON cpl.[month] = FORMAT(
      COALESCE(
        TRY_CONVERT(DATE, forecast.[period]),
        TRY_CONVERT(DATE, CONCAT(CAST(forecast.[period] AS NVARCHAR(15)), N''-01''), 126)
      ),
      ''yyyy-MM''
    )
),
resolved_fact AS (
  SELECT
    *,
    COALESCE([batchCreatedAt], [updatedAt]) AS [revisionDate],
    COALESCE(NULLIF([changedBy], N''''), N''sales-forecast-web'') AS [revisionUser],
    COALESCE(NULLIF([stampPeriod], N''''), N''No'') AS [resolvedStampPeriod],
    DATEFROMPARTS(YEAR([periodDate]), MONTH([periodDate]), 1) AS [fcstPeriodDate],
    CASE
      WHEN [priceFormula] = N''Fixed Price'' THEN ISNULL([priceFcst], 0)
      WHEN [priceFormula] IN (N''Naphtha'', N''Benzene'') THEN ISNULL([priceFcst], 0)
      ELSE ISNULL([cplPrice], 0) + ISNULL([spread], 0)
    END AS [effectivePrice]
  FROM fact_base
  WHERE [periodDate] IS NOT NULL
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
