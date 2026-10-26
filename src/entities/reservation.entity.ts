import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Room } from './room.entity.js';
import { User } from './user.entity.js';

export type ReservationStatus = 'CONFIRMED' | 'CANCELLED';
export type CreatedVia = 'MANUAL' | 'AI';

@Entity('reservations')
@Index(['roomId', 'startAt'])
export class Reservation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'room_id', type: 'int' })
  roomId: number;

  @ManyToOne(() => Room, (room) => room.reservations, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'room_id' })
  room: Relation<Room>;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ name: 'attendee_count', type: 'int' })
  attendeeCount: number;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @Column({ type: 'varchar', length: 10, default: 'CONFIRMED' })
  status: ReservationStatus;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'created_via', type: 'varchar', length: 10, default: 'MANUAL' })
  createdVia: CreatedVia;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
