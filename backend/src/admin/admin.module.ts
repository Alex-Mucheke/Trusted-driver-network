import { Module } from '@nestjs/common';
import { PrivacyModule } from '../privacy/privacy.module';
import { AdminController } from './admin.controller';

@Module({ imports: [PrivacyModule], controllers: [AdminController] })
export class AdminModule {}
