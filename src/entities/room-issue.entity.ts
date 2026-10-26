import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Room } from './room.entity.js';
import { User } from './user.entity.js';

export const ISSUE_CATEGORIES = ['SUPPLY', 'BROKEN', 'CLEANING', 'OTHER'] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_EQUIPMENT = [
  'TV',
  'VIDEO_CONF',
  'WHITEBOARD',
  'PROJECTOR',
  'OTHER',
] as const;
export type IssueEquipment = (typeof ISSUE_EQUIPMENT)[number];

export type IssueStatus = 'OPEN' | 'RESOLVED';

@Entity('room_issues')
export class RoomIssue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'room_id', type: 'int' })
  roomId: number;

  @ManyToOne(() => Room, (room) => room.issues, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'room_id' })
  room: Relation<Room>;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ type: 'varchar', length: 10 })
  category: IssueCategory;

  @Column({ type: 'varchar', length: 12, nullable: true })
  equipment: IssueEquipment | null;

  @Column({ type: 'varchar', length: 200 })
  content: string;

  @Column({ type: 'varchar', length: 10, default: 'OPEN' })
  status: IssueStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
