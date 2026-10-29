import { AiUsage } from './ai-usage.entity.js';
import { Department } from './department.entity.js';
import { Reservation } from './reservation.entity.js';
import { RoomIssue } from './room-issue.entity.js';
import { Room } from './room.entity.js';
import { User } from './user.entity.js';

export { AiUsage, Department, Reservation, Room, RoomIssue, User };

export const ENTITIES = [Department, User, Room, Reservation, RoomIssue, AiUsage];
