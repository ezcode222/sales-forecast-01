IF COL_LENGTH('dbo.overplan_config', 'compareLeft') IS NULL
BEGIN
  ALTER TABLE [dbo].[overplan_config]
  ADD [compareLeft] NVARCHAR(100) NOT NULL
    CONSTRAINT [overplan_config_compareLeft_df] DEFAULT N'Actual';
END;

IF COL_LENGTH('dbo.overplan_config', 'compareRight') IS NULL
BEGIN
  ALTER TABLE [dbo].[overplan_config]
  ADD [compareRight] NVARCHAR(100) NOT NULL
    CONSTRAINT [overplan_config_compareRight_df] DEFAULT N'Current Forecast';
END;
