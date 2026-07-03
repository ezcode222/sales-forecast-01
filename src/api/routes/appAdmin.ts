import { Router } from 'express';
import type { Request } from 'express';
import type { AuthUser } from '../auth';
import {
  listRoleAssignments,
  removeRoleAssignment,
  replaceRoleAssignments,
  requireAdmin,
} from '../services/appRoles';

const router = Router();

router.use(requireAdmin);

function sessionDisplayName(req: Request & { user?: AuthUser }) {
  const user = req.user;
  return String(user?.name ?? user?.email ?? 'Admin').trim() || 'Admin';
}

router.get('/roles', async (_req, res) => {
  try {
    const assignments = await listRoleAssignments();
    res.json({ assignments });
  } catch (error) {
    console.error('[admin] get roles error:', error);
    res.status(500).json({ error: 'Failed to load role assignments' });
  }
});

router.put('/roles', async (req, res) => {
  try {
    const body = req.body as { assignments?: unknown };
    if (!Array.isArray(body.assignments)) {
      return res.status(400).json({ error: 'assignments array is required' });
    }

    const assignments = body.assignments
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .map(value => ({
        empCode: String(value.empCode ?? ''),
        fullNameEng: String(value.fullNameEng ?? ''),
        currentEmail: String(value.currentEmail ?? ''),
        role: String(value.role ?? '') as 'admin' | 'super_user',
        source: typeof value.source === 'string' ? value.source : 'manual',
      }))
      .filter(item => item.empCode && (item.role === 'admin' || item.role === 'super_user'));

    const saved = await replaceRoleAssignments(assignments, sessionDisplayName(req as Request & { user?: AuthUser }));
    res.json({ assignments: saved });
  } catch (error) {
    console.error('[admin] put roles error:', error);
    res.status(500).json({ error: 'Failed to save role assignments' });
  }
});

router.delete('/roles/:empCode', async (req, res) => {
  try {
    const empCode = String(req.params.empCode ?? '').trim();
    if (!empCode) return res.status(400).json({ error: 'empCode is required' });
    await removeRoleAssignment(empCode);
    const assignments = await listRoleAssignments();
    res.json({ assignments });
  } catch (error) {
    console.error('[admin] delete role error:', error);
    res.status(500).json({ error: 'Failed to remove role assignment' });
  }
});

export default router;
