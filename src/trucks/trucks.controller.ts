import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { TrucksService } from './trucks.service';
import { CreateTruckDto } from './dto/create-truck.dto';
import { UpdateTruckDto } from './dto/update-truck.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateTruckNoteDto } from './dto/create-truck-note.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('trucks')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('trucks')
export class TrucksController {
  constructor(private trucksService: TrucksService) {}

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Post()
  create(@GetUser('companyId') companyId: string, @Body() dto: CreateTruckDto) {
    return this.trucksService.create(companyId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get()
  findAll(@GetUser('companyId') companyId: string) {
    return this.trucksService.findAll(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Get('deactivated')
  findDeactivated(@GetUser('companyId') companyId: string) {
    return this.trucksService.findDeactivated(companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD')
  @Patch(':id/activate')
  activate(@Param('id') id: string, @GetUser('companyId') companyId: string) {
    return this.trucksService.activate(id, companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser('companyId') companyId: string) {
    return this.trucksService.findOne(id, companyId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @GetUser('companyId') companyId: string,
    @Body() dto: UpdateTruckDto,
  ) {
    return this.trucksService.update(id, companyId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Delete(':id')
  remove(@Param('id') id: string, @GetUser('companyId') companyId: string) {
    return this.trucksService.remove(id, companyId);
  }
  /***Notes */
  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Post(':id/notes')
  createNote(
    @Param('id') truckId: string,
    @GetUser('companyId') companyId: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateTruckNoteDto,
  ) {
    return this.trucksService.createNote(truckId, companyId, userId, dto);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER', 'DRIVER')
  @Get(':id/notes')
  getNotes(@Param('id') truckId: string) {
    return this.trucksService.getNotes(truckId);
  }

  @Roles('ADMIN', 'TEAMLEAD', 'DISPATCHER')
  @Delete('notes/:id')
  removeNote(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.trucksService.removeNote(id, userId);
  }
}
