import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin/admin.controller.js';
import { SeedService } from './admin/seed.service.js';
import { AiUsageService } from './ai/ai-usage.service.js';
import { AiController } from './ai/ai.controller.js';
import { AiService } from './ai/ai.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './common/auth.js';
import { typeOrmOptions } from './database.js';
import { ENTITIES } from './entities/index.js';
import { HealthController } from './health.controller.js';
import { ReservationsController } from './reservations/reservations.controller.js';
import { ReservationsService } from './reservations/reservations.service.js';
import { RoomsController } from './rooms/rooms.controller.js';
import { RoomsService } from './rooms/rooms.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmOptions }),
    TypeOrmModule.forFeature(ENTITIES),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('.env 에 JWT_SECRET 이 없어요.');
        return { secret, signOptions: { expiresIn: '12h' } };
      },
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    RoomsController,
    ReservationsController,
    AdminController,
    AiController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    ReservationsService,
    RoomsService,
    SeedService,
    AiService,
    AiUsageService,
  ],
})
export class AppModule {}
