import express from 'express';
import Job from '../models/Job.js';

const router = express.Router();

// GET /api/jobs?status=open&area=gikondo&category=electrician,plumber
// `category` accepts a comma-separated list so a worker with several skills
// gets every matching job in one call.
router.get('/', async (req, res) => {
  try {
    const { status, area, category } = req.query;
    const filter = {
      ...(status ? { status } : {}),
      ...(area ? { area } : {}),
      ...(category ? { category: { $in: category.split(',') } } : {})
    };
    const jobs = await Job.find(filter).sort({ createdAt: -1 }).populate('client', 'name area').lean();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { client, category, description, area } = req.body;
    const job = await Job.create({ client, category, description, area });
    res.status(201).json(job);
  } catch (err) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate('client worker');
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
