import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAlarmDto } from './dto/create-alarm.dto';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class AlarmsService {
  constructor(private prisma: PrismaService) {}

  async create(dispatcherId: string, dto: CreateAlarmDto) {
    return this.prisma.alarm.create({
      data: {
        tripId: dto.tripId,
        driverId: dto.driverId,
        dispatcherId,
        time: new Date(dto.time),
        note: dto.note,
      },
    });
  }

  async findByTrip(tripId: string) {
    return this.prisma.alarm.findMany({
      where: { tripId },
      orderBy: { time: 'asc' },
    });
  }

  async remove(id: string) {
    const alarm = await this.prisma.alarm.findFirst({ where: { id } });
    if (!alarm) throw new NotFoundException('Alarm is not found');
    await this.prisma.alarm.delete({ where: { id } });
    return { message: 'Alarm deleted' };
  }

  @Cron('* * * * *')
  async checkAlarms() {
    const now = new Date();
    const alarms = await this.prisma.alarm.findMany({
      where: {
        time: { lte: now },
        isSent: false,
      },
      include: {
        driver: { select: { id: true, name: true } },
      },
    });

    for (const alarm of alarms) {
      console.log(`🔔 Будильник для ${alarm.driver.name}: ${alarm.note}`);

      await this.prisma.alarm.update({
        where: { id: alarm.id },
        data: { isSent: true },
      });
    }
  }
}
