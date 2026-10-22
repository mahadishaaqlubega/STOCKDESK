const { Audit, User, Shop } = require('../models');
const { Op } = require('sequelize');

// Log an action
exports.logAction = async (userId, shopId, action, entityType, entityId, details, req) => {
  try {
    const ipAddress = req?.ip || req?.connection?.remoteAddress || null;
    const userAgent = req?.get('user-agent') || null;

    await Audit.create({
      userId,
      shopId,
      action,
      entityType,
      entityId,
      details,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('Error logging action:', error);
  }
};

// Get audit logs for a shop
exports.getAuditLogs = async (req, res) => {
  try {
    const { shopId } = req.user;
    const { userId, action, entityType, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const where = { shopId };

    if (userId) where.userId = parseInt(userId);
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await Audit.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'username'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      total: count,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
};

// Get available users for filtering
exports.getAuditUsers = async (req, res) => {
  try {
    const { shopId } = req.user;

    const users = await User.findAll({
      where: { shopId },
      attributes: ['id', 'name', 'username'],
      raw: true,
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// Get audit log statistics
exports.getAuditStats = async (req, res) => {
  try {
    const { shopId } = req.user;

    const stats = await Audit.findAll({
      where: { shopId },
      attributes: [
        [require('sequelize').fn('COUNT', '*'), 'count'],
        'action',
      ],
      group: ['action'],
      raw: true,
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ message: 'Failed to fetch audit stats' });
  }
};
