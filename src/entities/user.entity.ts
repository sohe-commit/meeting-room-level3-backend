import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Department } from './department.entity.js';

export type Role = 'ADMIN' | 'EMPLOYEE';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 30 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 10, default: 'EMPLOYEE' })
  role: Role;

  @Column({ name: 'department_id', type: 'int' })
  departmentId: number;

  @ManyToOne(() => Department, (department) => department.users, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'department_id' })
  department: Relation<Department>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
