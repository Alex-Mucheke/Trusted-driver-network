import { Global, Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { EligibilityService } from './eligibility.service';

@Global()
@Module({
  controllers: [DriversController],
  providers: [EligibilityService],
  exports: [EligibilityService],
})
export class DriversModule {}
