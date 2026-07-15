-- Add CPL (Tecnon TW) and CPL (PCI) price bases alongside Benzene / FX rates.

ALTER TABLE [dbo].[price_management_values]
  ADD [cplTecnonPrice] DECIMAL(18, 4) NOT NULL CONSTRAINT [DF_price_management_values_cplTecnonPrice] DEFAULT 0,
      [cplPciPrice] DECIMAL(18, 4) NOT NULL CONSTRAINT [DF_price_management_values_cplPciPrice] DEFAULT 0;
