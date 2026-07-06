DECLARE @crmBuExpr NVARCHAR(300);
DECLARE @viewSql NVARCHAR(MAX);

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

SET @viewSql = N'
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
  ' + @crmBuExpr + N' AS [BU],
  CAST(r.[NewKey] AS NVARCHAR(200)) AS [RegistrationId],
  CAST(0 AS BIT) AS [IsManaged]
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
  r.[businessUnit] AS [BU],
  r.[id] AS [RegistrationId],
  CAST(1 AS BIT) AS [IsManaged]
FROM [dbo].[master_data_crm_registrations] r
WHERE r.[mainRegist] = 1;
';

EXEC(@viewSql);
