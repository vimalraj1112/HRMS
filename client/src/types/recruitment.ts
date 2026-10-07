export const JOB_STATUSES = ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const CANDIDATE_STATUSES = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'SELECTED',
  'REJECTED',
  'OFFERED',
  'HIRED',
  'WITHDRAWN',
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const INTERVIEW_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const INTERVIEW_MODES = ['ONSITE', 'PHONE', 'VIDEO'] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_RECOMMENDATIONS = ['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE'] as const;
export type InterviewRecommendation = (typeof INTERVIEW_RECOMMENDATIONS)[number];

export const OFFER_STATUSES = ['DRAFT', 'EXTENDED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export interface Reference {
  id: string;
}

export interface PersonReference extends Reference {
  employeeCode?: string | null;
  firstName: string;
  lastName: string;
}

export interface JobOpening {
  id: string;
  title: string;
  departmentId: string | null;
  designationId: string | null;
  hiringManagerId: string | null;
  location: string | null;
  employmentType: EmploymentType;
  openingsCount: number;
  description: string;
  requirements: string | null;
  minExperience: number | null;
  maxExperience: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  status: JobStatus;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
  hiringManager: PersonReference | null;
  createdBy: { id: string; email: string } | null;
  _count?: { candidates: number };
}

export interface Candidate {
  id: string;
  jobOpeningId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  currentCompany: string | null;
  currentDesignation: string | null;
  experienceYears: number | null;
  expectedSalary: number | null;
  resumeFileName: string | null;
  source: string | null;
  status: CandidateStatus;
  stageOrder: number;
  notes: string | null;
  rejectionReason: string | null;
  hiredEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
  jobOpening: { id: string; title: string; status: JobStatus; departmentId: string | null } | null;
  hiredEmployee: PersonReference | null;
  createdBy: { id: string; email: string } | null;
  hasResume: boolean;
  _count?: { interviews: number; offers: number };
}

export interface CandidateInterview {
  id: string;
  round: number;
  scheduledAt: string;
  durationMinutes: number;
  mode: InterviewMode;
  status: InterviewStatus;
  rating: number | null;
  recommendation: InterviewRecommendation | null;
  interviewer: PersonReference;
}

export interface CandidateOffer {
  id: string;
  annualCtc: number;
  status: OfferStatus;
  joiningDate: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CandidateDetail extends Candidate {
  interviews: CandidateInterview[];
  offers: CandidateOffer[];
}

export interface Interview {
  id: string;
  candidateId: string;
  interviewerId: string;
  round: number;
  scheduledAt: string;
  durationMinutes: number;
  mode: InterviewMode;
  locationOrLink: string | null;
  status: InterviewStatus;
  rating: number | null;
  recommendation: InterviewRecommendation | null;
  strengths: string | null;
  improvements: string | null;
  feedback: string | null;
  feedbackAt: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: CandidateStatus;
    jobOpening: { id: string; title: string } | null;
  };
  interviewer: PersonReference;
}

export interface Offer {
  id: string;
  candidateId: string;
  jobOpeningId: string | null;
  employeeId: string | null;
  departmentId: string | null;
  designationId: string | null;
  annualCtc: number;
  joiningDate: string | null;
  status: OfferStatus;
  issuedAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: CandidateStatus;
    jobOpening: { id: string; title: string } | null;
  };
  jobOpening: { id: string; title: string } | null;
  employee: PersonReference | null;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
  createdBy: { id: string; email: string } | null;
  candidateOutcome?: CandidateStatus | null;
}

export interface JobListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: JobStatus;
  departmentId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CandidateListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: CandidateStatus;
  jobOpeningId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface InterviewListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: InterviewStatus;
  candidateId?: string;
  interviewerId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface OfferListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OfferStatus;
  candidateId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface JobPayload {
  title: string;
  description: string;
  departmentId?: string;
  designationId?: string;
  hiringManagerId?: string;
  location?: string;
  employmentType?: EmploymentType;
  openingsCount?: number;
  requirements?: string;
  minExperience?: number;
  maxExperience?: number;
  salaryMin?: number;
  salaryMax?: number;
  publishedAt?: string;
  status?: JobStatus;
}

export interface CandidatePayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobOpeningId?: string;
  currentCompany?: string;
  currentDesignation?: string;
  experienceYears?: number;
  expectedSalary?: number;
  source?: string;
  notes?: string;
}

export interface CandidateUpdatePayload extends Partial<CandidatePayload> {
  status?: CandidateStatus;
  rejectionReason?: string;
  employeeId?: string;
}

export interface InterviewPayload {
  candidateId: string;
  interviewerId: string;
  round?: number;
  scheduledAt: string;
  durationMinutes?: number;
  mode?: InterviewMode;
  locationOrLink?: string;
}

export interface InterviewUpdatePayload extends Partial<Omit<InterviewPayload, 'candidateId'>> {
  status?: InterviewStatus;
}

export interface InterviewFeedbackPayload {
  rating: number;
  recommendation: InterviewRecommendation;
  feedback?: string;
  strengths?: string;
  improvements?: string;
}

export interface OfferPayload {
  candidateId: string;
  jobOpeningId?: string;
  employeeId?: string;
  departmentId?: string;
  designationId?: string;
  annualCtc: number;
  joiningDate?: string;
  expiresAt?: string;
  notes?: string;
  status?: OfferStatus;
}

export interface OfferUpdatePayload extends Partial<OfferPayload> {
  status?: OfferStatus;
}
