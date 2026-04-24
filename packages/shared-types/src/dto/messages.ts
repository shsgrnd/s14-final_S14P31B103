import { z } from 'zod';
import {
  InboundMessageSchema,
  OutboundMessageSchema,
  InboundPayloadByType,
  OutboundPayloadByType,
} from '../schemas/messages';
import { InboundMessageType, OutboundMessageType } from '../enums/messages';

/**
 * 런타임 스키마를 기반으로 추론한 표준 메시지 DTO 타입입니다.
 *
 * 스키마와 타입이 분리되어 따로 관리되면 쉽게 불일치가 생기므로,
 * `z.infer`를 통해 단일 소스(schema)에서 타입을 생성합니다.
 */
export type InboundMessage = z.infer<typeof InboundMessageSchema>;
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;

/**
 * 요청-응답 상관관계 추적에 사용하는 requestId 타입 별칭입니다.
 * 문자열 자체이지만 의미를 드러내기 위해 이름을 분리했습니다.
 */
export type MessageRequestId = string;

/**
 * 메시지 type에 대응되는 payload 타입을 꺼내는 제네릭 유틸입니다.
 *
 * 예:
 * - InboundPayload<'RECOMMEND_PR'> => { base: string }
 * - OutboundPayload<'ERROR'> => { code: ErrorCode; message: string }
 */
export type InboundPayload<T extends InboundMessageType> = InboundPayloadByType[T];
export type OutboundPayload<T extends OutboundMessageType> = OutboundPayloadByType[T];
