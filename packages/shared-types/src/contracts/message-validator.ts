import { InboundMessageSchema, OutboundMessageSchema } from '../schemas/messages';
import type { InboundMessage, OutboundMessage } from '../dto/messages';
import type { MessageValidator } from './repositories';

/**
 * Zod 기반 기본 메시지 검증기 구현체입니다.
 *
 * 동작 방식:
 * - parseInbound/parseOutbound 호출 시 스키마 검증 수행
 * - 계약 위반이면 ZodError throw
 *
 * 라우터 계층은 이 예외를 잡아 표준 ERROR 메시지로 변환해
 * 프론트에 일관된 오류 응답을 전달할 수 있습니다.
 */
export class ZodMessageValidator implements MessageValidator {
  parseInbound(message: unknown): InboundMessage {
    return InboundMessageSchema.parse(message);
  }

  parseOutbound(message: unknown): OutboundMessage {
    return OutboundMessageSchema.parse(message);
  }
}
