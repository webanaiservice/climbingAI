import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RouteSettingController } from './route-setting.controller';
import { TianyuRoutesService } from './tianyu-routes.service';

@Module({
  imports: [AuthModule],
  controllers: [RouteSettingController],
  providers: [TianyuRoutesService],
})
export class RouteSettingModule {}
