-- CC recipients (non-owners): notifications off by default; opt in via bell toggle.
UPDATE [dbo].[forecast_cc_recipients] SET [notifyEnabled] = 0;

ALTER TABLE [dbo].[forecast_cc_recipients] DROP CONSTRAINT [forecast_cc_recipients_notifyEnabled_df];
ALTER TABLE [dbo].[forecast_cc_recipients]
  ADD CONSTRAINT [forecast_cc_recipients_notifyEnabled_df] DEFAULT 0 FOR [notifyEnabled];
