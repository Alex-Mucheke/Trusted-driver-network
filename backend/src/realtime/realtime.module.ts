import { Global, Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  imports: [LocationsModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
