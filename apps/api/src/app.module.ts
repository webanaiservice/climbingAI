import { TrainingModule } from './training/training.module';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { HoldsModule } from './holds/holds.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { TeamModule } from './team/team.module';
import { RoutesModule } from './routes/routes.module';
import { CameraModule } from './camera/camera.module';
import { RouteSettingModule } from './route-setting/route-setting.module';

@Module({
  imports: [
    InfrastructureModule,
    AuthModule,
    TeamModule,
    HoldsModule,
    RoutesModule,
    RouteSettingModule,
    CameraModule,
    HealthModule,
    TrainingModule,
  ],
})
export class AppModule {}
