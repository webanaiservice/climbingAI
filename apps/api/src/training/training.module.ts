import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrainingStorageService } from './training-storage.service';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';
import { TrainingVideoService } from './training-video.service';
import { TrainingAnalysisService } from './training-analysis.service';
@Module({
  imports: [AuthModule],
  controllers: [TrainingController],
  providers: [
    TrainingStorageService,
    TrainingService,
    TrainingVideoService,
    TrainingAnalysisService,
  ],
})
export class TrainingModule {}
