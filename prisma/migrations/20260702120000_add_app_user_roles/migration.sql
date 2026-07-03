CREATE TABLE [dbo].[app_user_roles] (
    [empCode] NVARCHAR(50) NOT NULL,
    [fullNameEng] NVARCHAR(200) NOT NULL CONSTRAINT [app_user_roles_fullNameEng_df] DEFAULT N'',
    [currentEmail] NVARCHAR(320) NOT NULL CONSTRAINT [app_user_roles_currentEmail_df] DEFAULT N'',
    [role] NVARCHAR(20) NOT NULL,
    [assignedBy] NVARCHAR(200) NULL,
    [source] NVARCHAR(20) NOT NULL CONSTRAINT [app_user_roles_source_df] DEFAULT N'manual',
    [assignedAt] DATETIME2 NOT NULL CONSTRAINT [app_user_roles_assignedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [app_user_roles_pkey] PRIMARY KEY CLUSTERED ([empCode])
);

CREATE NONCLUSTERED INDEX [app_user_roles_role_idx]
ON [dbo].[app_user_roles]([role]);

-- Default admins (skip if empCode already assigned)
INSERT INTO [dbo].[app_user_roles] ([empCode], [fullNameEng], [currentEmail], [role], [source])
SELECT c.[empCode], c.[fullNameEng], c.[currentEmail], N'admin', N'seed_admin'
FROM [dbo].[hr_employee_cache] c
WHERE LOWER(LTRIM(RTRIM(c.[fullNameEng]))) IN (
    LOWER(N'Supachai Sumeteenarumit'),
    LOWER(N'Wittavin Ploysopon'),
    LOWER(N'Pakorn Worakarn')
)
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[app_user_roles] r WHERE r.[empCode] = c.[empCode]
);

-- Default super users: nylon cost center (admin wins — exclude existing rows)
INSERT INTO [dbo].[app_user_roles] ([empCode], [fullNameEng], [currentEmail], [role], [source])
SELECT c.[empCode], c.[fullNameEng], c.[currentEmail], N'super_user', N'seed_nylon_default'
FROM [dbo].[hr_employee_cache] c
WHERE c.[costCenterEng] = N'UCHA Nylon Sales & Marketing'
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[app_user_roles] r WHERE r.[empCode] = c.[empCode]
);
