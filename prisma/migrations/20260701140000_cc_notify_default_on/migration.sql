-- CC recipients: notifications on by default; opt out via bell toggle.
UPDATE [dbo].[forecast_cc_recipients] SET [notifyEnabled] = 1;

ALTER TABLE [dbo].[forecast_cc_recipients] DROP CONSTRAINT [forecast_cc_recipients_notifyEnabled_df];
ALTER TABLE [dbo].[forecast_cc_recipients]
  ADD CONSTRAINT [forecast_cc_recipients_notifyEnabled_df] DEFAULT 1 FOR [notifyEnabled];
