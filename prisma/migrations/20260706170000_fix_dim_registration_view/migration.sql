DECLARE @crmBuExpr NVARCHAR(300);
DECLARE @dimViewSql NVARCHAR(MAX);
DECLARE @factViewSql NVARCHAR(MAX);

IF EXISTS (
  SELECT 1
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'VW_CRM_RegistrationAll_1'
    AND COLUMN_NAME = 'BU'
)
  SET @crmBuExpr = N'NULLIF(LTRIM(RTRIM(CAST(r.[BU] AS NVARCHAR(50)))), N'''')';
ELSE
  SET @crmBuExpr = N'CAST(NULL AS NVARCHAR(50))';

SET @dimViewSql = N'
CREATE OR ALTER VIEW [dbo].[DimRegistration] AS
SELECT
  r.[RegistrationTopic],
  r.[SoldToCode],
  r.[ShipToCode],
  r.[Group],
  r.[MaterialNameOnCoa],
  r.[AdditionalRequirement],
  r.[Pic],
  r.[Commission],
  r.[ProductDescription],
  r.[Classified],
  r.[CommissionIndirect],
  r.[CommissionFinancialDiscount],
  r.[NewCoaName],
  r.[NewTier1],
  r.[NewOem],
  r.[Packing],
  r.[OnOffSpec],
  r.[AgreedSpecType],
  r.[WasteScrap],
  r.[ForResaleNotApprove],
  r.[ImdsDate],
  r.[Model],
  r.[CreatedOn],
  r.[Approve],
  r.[PartName],
  r.[CoaName],
  r.[CreatedByName],
  r.[OwnerName],
  r.[Cat1Name],
  r.[Cat2Name],
  r.[Cat3Name],
  r.[ZoneName],
  r.[PlantName],
  r.[PlantCode],
  r.[CountryCode],
  r.[CountryName],
  r.[EndUserCode],
  r.[EndUserExportControl],
  r.[EndUserName],
  r.[StateCodeName],
  r.[ProductName],
  r.[MaterialDescription],
  r.[MaterialCode],
  r.[ShipTo_name],
  r.[SoldTo_name],
  r.[End_user],
  r.[NewKey],
  r.[KeyforNoCRM],
  r.[MainRegist],
  r.[KeyforNoEndUser],
  r.[Main_NoEnduser],
  ' + @crmBuExpr + N' AS [BU]
FROM [dbo].[VW_CRM_RegistrationAll_1] r
WHERE r.[NewKey] IS NOT NULL
  AND r.[MainRegist] = 1

UNION ALL

SELECT
  r.[registrationTopic] AS [RegistrationTopic],
  r.[soldToCode] AS [SoldToCode],
  r.[shipToCode] AS [ShipToCode],
  r.[groupName] AS [Group],
  r.[materialNameOnCoa] AS [MaterialNameOnCoa],
  r.[additionalRequirement] AS [AdditionalRequirement],
  r.[pic] AS [Pic],
  r.[commission] AS [Commission],
  r.[productDescription] AS [ProductDescription],
  r.[classified] AS [Classified],
  r.[commissionIndirect] AS [CommissionIndirect],
  r.[commissionFinancialDiscount] AS [CommissionFinancialDiscount],
  r.[newCoaName] AS [NewCoaName],
  r.[newTier1] AS [NewTier1],
  r.[newOem] AS [NewOem],
  r.[packing] AS [Packing],
  r.[onOffSpec] AS [OnOffSpec],
  r.[agreedSpecType] AS [AgreedSpecType],
  r.[wasteScrap] AS [WasteScrap],
  r.[forResaleNotApprove] AS [ForResaleNotApprove],
  r.[imdsDate] AS [ImdsDate],
  r.[model] AS [Model],
  r.[createdAt] AS [CreatedOn],
  r.[approve] AS [Approve],
  r.[partName] AS [PartName],
  r.[coaName] AS [CoaName],
  r.[createdBy] AS [CreatedByName],
  r.[ownerName] AS [OwnerName],
  r.[process] AS [Cat1Name],
  r.[application] AS [Cat2Name],
  r.[subApp] AS [Cat3Name],
  r.[zoneName] AS [ZoneName],
  r.[plantName] AS [PlantName],
  r.[plantCode] AS [PlantCode],
  r.[countryCode] AS [CountryCode],
  r.[countryName] AS [CountryName],
  r.[endUserCode] AS [EndUserCode],
  r.[endUserExportControl] AS [EndUserExportControl],
  r.[endUserName] AS [EndUserName],
  CAST(NULL AS NVARCHAR(500)) AS [StateCodeName],
  r.[productName] AS [ProductName],
  r.[materialDescription] AS [MaterialDescription],
  r.[materialCode] AS [MaterialCode],
  r.[shipToName] AS [ShipTo_name],
  r.[soldToName] AS [SoldTo_name],
  r.[endUser] AS [End_user],
  r.[newKey] AS [NewKey],
  r.[keyForNoCRM] AS [KeyforNoCRM],
  r.[mainRegist] AS [MainRegist],
  CAST(NULL AS NVARCHAR(500)) AS [KeyforNoEndUser],
  CAST(NULL AS INT) AS [Main_NoEnduser],
  r.[businessUnit] AS [BU]
FROM [dbo].[master_data_crm_registrations] r
WHERE r.[mainRegist] = 1;
';

SET @factViewSql = N'
CREATE OR ALTER VIEW [dbo].[FactForecast] AS
WITH fact_base AS (
  SELECT
    forecast.[registrationId],
    COALESCE(managed.[newKey], forecast.[registrationId]) AS [registrationKey],
    forecast.[versionName],
    forecast.[period],
    forecast.[granularity],
    forecast.[qtyFcst],
    forecast.[priceFcst],
    forecast.[amountFcst],
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
  [registrationKey] AS [Registration Key],
  [fcstPeriodDate] AS [Fcst Period],
  CAST([qtyFcst] AS DECIMAL(18,4)) AS [NewQty],
  CAST([effectivePrice] AS DECIMAL(18,4)) AS [Price],
  CAST(
    COALESCE(NULLIF([amountFcst], 0), [qtyFcst] * [effectivePrice])
    AS DECIMAL(18,4)
  ) AS [Amount],
  [resolvedStampPeriod] AS [Stamp Period]
FROM resolved_fact;
';

EXEC(@dimViewSql);
EXEC(@factViewSql);
