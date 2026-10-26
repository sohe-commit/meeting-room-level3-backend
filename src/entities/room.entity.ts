import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Reservation } from './reservation.entity.js';
import { RoomIssue } from './room-issue.entity.js';

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  name: string;

  @Column({ type: 'int' })
  floor: number;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ name: 'has_tv', type: 'boolean', default: false })
  hasTv: boolean;

  @Column({ name: 'has_video_conf', type: 'boolean', default: false })
  hasVideoConf: boolean;

  @Column({ name: 'has_whiteboard', type: 'boolean', default: false })
  hasWhiteboard: boolean;

  @Column({ name: 'has_projector', type: 'boolean', default: false })
  hasProjector: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => Reservation, (reservation) => reservation.room)
  reservations: Relation<Reservation[]>;

  @OneToMany(() => RoomIssue, (issue) => issue.room)
  issues: Relation<RoomIssue[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
