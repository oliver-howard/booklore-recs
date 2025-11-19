import { Request, Response } from 'express';
import { DatabaseService } from '../database.js';

/**
 * Admin Controller
 * Handles admin panel routes
 */
export class AdminController {
  /**
   * Check if request is from admin user
   */
  private checkAdmin(req: Request, res: Response): boolean {
    if (!req.session.userId) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return false;
    }
    const user = DatabaseService.getUserById(req.session.userId);
    if (!user || !user.isAdmin) {
      res.status(403).json({ success: false, message: 'Admin privileges required' });
      return false;
    }
    return true;
  }

  /**
   * List all users
   * GET /api/admin/users
   */
  listUsers = async (req: Request, res: Response) => {
    if (!this.checkAdmin(req, res)) return;

    const users = DatabaseService.getAllUsers();
    res.json({ users });
  };

  /**
   * Delete user
   * DELETE /api/admin/users/:userId
   */
  deleteUser = async (req: Request, res: Response) => {
    if (!this.checkAdmin(req, res)) return;

    const targetId = parseInt(req.params.userId, 10);

    if (req.session.userId === targetId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account while logged in as admin.',
      });
    }

    DatabaseService.deleteUser(targetId);
    res.json({ success: true, message: 'User deleted' });
  };

  /**
   * Change user password
   * POST /api/admin/users/:userId/password
   */
  changePassword = async (req: Request, res: Response) => {
    if (!this.checkAdmin(req, res)) return;

    const targetId = parseInt(req.params.userId, 10);
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    await DatabaseService.updateUserPassword(targetId, password);
    res.json({ success: true, message: 'Password updated' });
  };

  /**
   * Toggle admin role
   * POST /api/admin/users/:userId/admin
   */
  toggleAdmin = async (req: Request, res: Response) => {
    if (!this.checkAdmin(req, res)) return;

    const targetId = parseInt(req.params.userId, 10);
    const { isAdmin } = req.body as { isAdmin: boolean };

    if (req.session.userId === targetId) {
      return res.status(400).json({
        success: false,
        message: 'Use another admin account to change your own role.',
      });
    }

    DatabaseService.updateAdminStatus(targetId, !!isAdmin);
    res.json({ success: true, message: 'User role updated' });
  };
}
