import type { Request, Response } from 'express';
import { getRequestMeta } from '../../services/audit.service';
import { ApiError } from '../../utils/ApiError';
import { sendCreated, sendPaginated, sendSuccess } from '../../utils/apiResponse';
import { getBody, getParams, getQuery } from '../../utils/request';
import { createOffer, getOffer, listOffers, respondToOffer, updateOffer } from './offers.service';
import type {
  CreateOfferBody,
  ListOffersQuery,
  RespondToOfferBody,
  UpdateOfferBody,
} from './offers.validator';

type Actor = { id: string; email: string; role: string; employeeId: string | null };

function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, email: req.user.email, role: req.user.role, employeeId: req.user.employeeId };
}

export async function listOffersController(req: Request, res: Response): Promise<void> {
  const result = await listOffers(getQuery<ListOffersQuery>(req));
  sendPaginated(res, result.items, result.meta, 'Offers retrieved');
}

export async function getOfferController(req: Request, res: Response): Promise<void> {
  const offer = await getOffer(getParams<{ id: string }>(req).id);
  sendSuccess(res, offer, 'Offer retrieved');
}

export async function createOfferController(req: Request, res: Response): Promise<void> {
  const offer = await createOffer(getBody<CreateOfferBody>(req), actorOf(req), getRequestMeta(req));
  sendCreated(res, offer, 'Offer created');
}

export async function updateOfferController(req: Request, res: Response): Promise<void> {
  const offer = await updateOffer(
    getParams<{ id: string }>(req).id,
    getBody<UpdateOfferBody>(req),
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, offer, 'Offer updated');
}

export async function respondToOfferController(req: Request, res: Response): Promise<void> {
  const offer = await respondToOffer(
    getParams<{ id: string }>(req).id,
    getBody<RespondToOfferBody>(req),
    actorOf(req),
    getRequestMeta(req),
  );
  sendSuccess(res, offer, 'Offer response recorded');
}
