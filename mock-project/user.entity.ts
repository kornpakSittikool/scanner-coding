import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Post } from './post.entity';

/**
 * Represent a user in the system.
 * Handles authentication and profiling.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150, unique: true, nullable: false })
  email: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ name: 'display_name', nullable: true })
  displayName: string;

  @Column({ default: 'user' })
  role: string;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];

  /**
   * Check if user is administrator.
   */
  isAdmin(): boolean {
    return this.role === 'admin';
  }
}
