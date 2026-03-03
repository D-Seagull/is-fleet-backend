import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { TranslationService } from 'src/translation/translation.service';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private translation: TranslationService,
  ) {}
  async create(senderId: string, dto: CreateMessageDto) {
    let translatedContent: string | null = null;

    if (dto.translate) {
      // Знаходимо рейс і отримувача
      const trip = await this.prisma.trip.findFirst({
        where: { id: dto.tripId },
        include: {
          driver: { select: { id: true, language: true } },
          dispatcher: { select: { id: true, language: true } },
        },
      });

      // Визначаємо мову отримувача
      const receiver =
        trip?.driverId === senderId ? trip?.dispatcher : trip?.driver;
      const receiverLanguage = receiver?.language || 'EN';

      // Перекладаємо
      const targetCode = this.translation.getLanguageCode(receiverLanguage);
      translatedContent = await this.translation.translateText(
        dto.content,
        targetCode,
      );
    }

    return this.prisma.message.create({
      data: {
        tripId: dto.tripId,
        senderId,
        content: dto.content,
        translatedContent,
      },
      include: {
        sender: {
          select: { id: true, name: true, role: true },
        },
      },
    });
  }

  async findByTrip(tripId: string) {
    return this.prisma.message.findMany({
      where: { tripId },
      include: {
        sender: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
