CREATE TABLE [dbo].[customer_master_cache] (
    [custCode] NVARCHAR(50) NOT NULL,
    [customerName] NVARCHAR(500) NOT NULL CONSTRAINT [customer_master_cache_customerName_df] DEFAULT N'',
    [syncedAt] DATETIME2 NOT NULL CONSTRAINT [customer_master_cache_syncedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [customer_master_cache_pkey] PRIMARY KEY CLUSTERED ([custCode])
);

CREATE NONCLUSTERED INDEX [customer_master_cache_customerName_idx]
ON [dbo].[customer_master_cache]([customerName]);
