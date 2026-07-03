-- Default CC notify: only Taksaporn Poldongnok on; everyone else off
UPDATE [dbo].[forecast_cc_recipients]
SET [notifyEnabled] = 0;

UPDATE [dbo].[forecast_cc_recipients]
SET [notifyEnabled] = 1
WHERE LOWER(LTRIM(RTRIM([currentEmail]))) = LOWER(N'taksaporn@ube.co.th');

ALTER TABLE [dbo].[forecast_cc_recipients] DROP CONSTRAINT [forecast_cc_recipients_notifyEnabled_df];
ALTER TABLE [dbo].[forecast_cc_recipients]
  ADD CONSTRAINT [forecast_cc_recipients_notifyEnabled_df] DEFAULT 0 FOR [notifyEnabled];
