-- Backfill Supachai Sumeteenarumit admin (HR fullNameEng may contain extra spaces)
INSERT INTO [dbo].[app_user_roles] ([empCode], [fullNameEng], [currentEmail], [role], [source])
SELECT c.[empCode], c.[fullNameEng], c.[currentEmail], N'admin', N'seed_admin'
FROM [dbo].[hr_employee_cache] c
WHERE (
    LOWER(REPLACE(REPLACE(LTRIM(RTRIM(c.[fullNameEng])), CHAR(9), ' '), '  ', ' ')) = LOWER(N'Supachai Sumeteenarumit')
    OR LOWER(LTRIM(RTRIM(c.[adLoginName]))) = LOWER(N'supachais')
)
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[app_user_roles] r WHERE r.[empCode] = c.[empCode]
);
