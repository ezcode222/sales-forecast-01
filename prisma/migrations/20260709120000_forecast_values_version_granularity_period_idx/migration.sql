IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'forecast_values_version_granularity_period_idx'
    AND object_id = OBJECT_ID(N'[dbo].[forecast_values]')
)
BEGIN
  CREATE NONCLUSTERED INDEX [forecast_values_version_granularity_period_idx]
    ON [dbo].[forecast_values]([versionName], [granularity], [period], [registrationId])
    INCLUDE ([qtyFcst], [priceFcst], [amountFcst]);
END;
