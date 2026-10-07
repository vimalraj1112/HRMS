import { Router } from 'express';
import { PERMISSIONS } from '../../config/rbac';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { uploadSingleFile } from '../../middleware/upload.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createCandidateController,
  deleteCandidateController,
  downloadResumeController,
  getCandidateController,
  listCandidatesController,
  updateCandidateController,
  uploadResumeController,
} from './candidates.controller';
import { candidateIdParamSchema, createCandidateSchema, listCandidatesQuerySchema, updateCandidateSchema } from './candidates.validator';
import {
  createInterviewController,
  getInterviewController,
  listInterviewsController,
  submitInterviewFeedbackController,
  updateInterviewController,
} from './interviews.controller';
import {
  createInterviewSchema,
  interviewIdParamSchema,
  listInterviewsQuerySchema,
  submitFeedbackSchema,
  updateInterviewSchema,
} from './interviews.validator';
import {
  createJobController,
  deleteJobController,
  getJobController,
  listJobsController,
  updateJobController,
} from './jobs.controller';
import { createJobSchema, jobIdParamSchema, listJobsQuerySchema, updateJobSchema } from './jobs.validator';
import {
  createOfferController,
  getOfferController,
  listOffersController,
  respondToOfferController,
  updateOfferController,
} from './offers.controller';
import {
  createOfferSchema,
  listOffersQuerySchema,
  offerIdParamSchema,
  respondToOfferSchema,
  updateOfferSchema,
} from './offers.validator';

export const recruitmentRouter = Router();

recruitmentRouter.use(authenticate);

// ── Job openings ─────────────────────────────────────────────
recruitmentRouter.get(
  '/jobs',
  requirePermission(PERMISSIONS.JOB_MANAGE),
  validate({ query: listJobsQuerySchema }),
  listJobsController,
);

recruitmentRouter.get(
  '/jobs/:id',
  requirePermission(PERMISSIONS.JOB_MANAGE),
  validate({ params: jobIdParamSchema }),
  getJobController,
);

recruitmentRouter.post(
  '/jobs',
  requirePermission(PERMISSIONS.JOB_MANAGE),
  validate({ body: createJobSchema }),
  createJobController,
);

recruitmentRouter.patch(
  '/jobs/:id',
  requirePermission(PERMISSIONS.JOB_MANAGE),
  validate({ params: jobIdParamSchema, body: updateJobSchema }),
  updateJobController,
);

recruitmentRouter.delete(
  '/jobs/:id',
  requirePermission(PERMISSIONS.JOB_MANAGE),
  validate({ params: jobIdParamSchema }),
  deleteJobController,
);

// ── Candidates ───────────────────────────────────────────────
recruitmentRouter.get(
  '/candidates',
  requirePermission(PERMISSIONS.CANDIDATE_MANAGE),
  validate({ query: listCandidatesQuerySchema }),
  listCandidatesController,
);

recruitmentRouter.get(
  '/candidates/:id',
  requirePermission(PERMISSIONS.CANDIDATE_MANAGE),
  validate({ params: candidateIdParamSchema }),
  getCandidateController,
);

recruitmentRouter.post(
  '/candidates',
  requirePermission(PERMISSIONS.CANDIDATE_MANAGE),
  validate({ body: createCandidateSchema }),
  createCandidateController,
);

recruitmentRouter.patch(
  '/candidates/:id',
  requirePermission(PERMISSIONS.CANDIDATE_MANAGE),
  validate({ params: candidateIdParamSchema, body: updateCandidateSchema }),
  updateCandidateController,
);

recruitmentRouter.post(
  '/candidates/:id/resume',
  requirePermission(PERMISSIONS.CANDIDATE_MANAGE),
  uploadSingleFile,
  validate({ params: candidateIdParamSchema }),
  uploadResumeController,
);

recruitmentRouter.get(
  '/candidates/:id/resume',
  requirePermission(PERMISSIONS.CANDIDATE_MANAGE),
  validate({ params: candidateIdParamSchema }),
  downloadResumeController,
);

recruitmentRouter.delete(
  '/candidates/:id',
  requirePermission(PERMISSIONS.CANDIDATE_MANAGE),
  validate({ params: candidateIdParamSchema }),
  deleteCandidateController,
);

// ── Interviews ───────────────────────────────────────────────
recruitmentRouter.get(
  '/interviews',
  requirePermission(PERMISSIONS.INTERVIEW_MANAGE),
  validate({ query: listInterviewsQuerySchema }),
  listInterviewsController,
);

recruitmentRouter.get(
  '/interviews/:id',
  requirePermission(PERMISSIONS.INTERVIEW_MANAGE),
  validate({ params: interviewIdParamSchema }),
  getInterviewController,
);

recruitmentRouter.post(
  '/interviews',
  requirePermission(PERMISSIONS.INTERVIEW_MANAGE),
  validate({ body: createInterviewSchema }),
  createInterviewController,
);

recruitmentRouter.patch(
  '/interviews/:id',
  requirePermission(PERMISSIONS.INTERVIEW_MANAGE),
  validate({ params: interviewIdParamSchema, body: updateInterviewSchema }),
  updateInterviewController,
);

// Feedback rights are intentionally broader than scheduling rights so a
// hiring manager can submit their own scorecard.
recruitmentRouter.post(
  '/interviews/:id/feedback',
  requirePermission(PERMISSIONS.INTERVIEW_MANAGE, PERMISSIONS.INTERVIEW_FEEDBACK),
  validate({ params: interviewIdParamSchema, body: submitFeedbackSchema }),
  submitInterviewFeedbackController,
);

// ── Offers ───────────────────────────────────────────────────
recruitmentRouter.get(
  '/offers',
  requirePermission(PERMISSIONS.OFFER_MANAGE),
  validate({ query: listOffersQuerySchema }),
  listOffersController,
);

recruitmentRouter.get(
  '/offers/:id',
  requirePermission(PERMISSIONS.OFFER_MANAGE),
  validate({ params: offerIdParamSchema }),
  getOfferController,
);

recruitmentRouter.post(
  '/offers',
  requirePermission(PERMISSIONS.OFFER_MANAGE),
  validate({ body: createOfferSchema }),
  createOfferController,
);

recruitmentRouter.patch(
  '/offers/:id',
  requirePermission(PERMISSIONS.OFFER_MANAGE),
  validate({ params: offerIdParamSchema, body: updateOfferSchema }),
  updateOfferController,
);

recruitmentRouter.post(
  '/offers/:id/respond',
  requirePermission(PERMISSIONS.OFFER_MANAGE),
  validate({ params: offerIdParamSchema, body: respondToOfferSchema }),
  respondToOfferController,
);
