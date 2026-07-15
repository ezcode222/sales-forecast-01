-- Polymer pricing policy + FX rates for Fix JPY / Fix THB.

ALTER TABLE [dbo].[price_management_values]
  ADD [jpyUsdRate] DECIMAL(18, 4) NOT NULL CONSTRAINT [DF_price_management_values_jpyUsdRate] DEFAULT 0,
      [thbUsdRate] DECIMAL(18, 4) NOT NULL CONSTRAINT [DF_price_management_values_thbUsdRate] DEFAULT 0;

ALTER TABLE [dbo].[registration_price_settings]
  ADD [pricingPolicy] NVARCHAR(50) NULL;

ALTER TABLE [dbo].[master_data_crm_registrations]
  ADD [pricingPolicy] NVARCHAR(50) NULL;
