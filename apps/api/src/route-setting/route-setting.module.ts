import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RouteSettingController } from './route-setting.controller';

@Module({
  imports: [AuthModule],
  controllers: [RouteSettingController],
})
export class RouteSettingModule {}
