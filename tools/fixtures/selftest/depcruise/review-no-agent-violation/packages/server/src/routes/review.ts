import { buildScore } from '../services/review-service';
import { summarize } from '@tm/agent';

export const today = () => [buildScore(), summarize()];

