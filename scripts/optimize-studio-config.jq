def supported_schema($name; $document_kind):
  {
    type: "json_schema",
    json_schema: {
      name: $name,
      schema: {
        type: "object",
        properties: {
          document_title: {
            type: "string",
            description: "문서 첫 페이지의 대표 제목만 추출한다. 없으면 빈 문자열."
          },
          received_reason: {
            type: "string",
            description: ("이 " + $document_kind + "를 받은 직접 이유를 원문에 근거해 한 문장으로 추출한다. 추측하지 않는다.")
          },
          important_impact: {
            type: "string",
            description: "사용자에게 중요한 영향이나 불이익을 원문에 근거해 한 문장으로 추출한다. 없으면 빈 문자열."
          },
          cautions: {
            type: "array",
            description: "원문에 명시된 핵심 주의사항만 최대 3개 추출한다. 없으면 빈 배열.",
            items: {
              type: "object",
              properties: {
                text: {
                  type: "string",
                  description: "추측하지 않고 원문 의미를 유지한 짧은 주의 문장."
                },
                page: {
                  type: "integer",
                  description: "근거가 있는 1부터 시작하는 페이지 번호. 찾지 못하면 0."
                },
                quote: {
                  type: "string",
                  description: "주의사항을 직접 뒷받침하는 짧은 원문 인용. 없으면 빈 문자열."
                }
              },
              required: ["text", "page", "quote"]
            }
          },
          fields: {
            type: "array",
            description: "사용자가 확인하거나 행동하는 데 꼭 필요한 핵심 정보만 최대 8개 추출한다. 날짜, 금액, 대상 조건, 문의처, 준비물, 계좌 정보만 포함하고 중복은 제거한다.",
            items: {
              type: "object",
              properties: {
                field_type: {
                  type: "string",
                  enum: ["DATE", "AMOUNT", "PHONE", "URL", "ACCOUNT", "ELIGIBILITY", "DOCUMENT_LIST", "TEXT"],
                  description: "값의 종류. 날짜 DATE, 금액 AMOUNT, 전화 PHONE, 공식 주소 URL, 계좌 ACCOUNT, 대상 조건 ELIGIBILITY, 준비물 DOCUMENT_LIST, 그 밖의 핵심값 TEXT 중 하나."
                },
                label: {
                  type: "string",
                  description: "납부기한, 납부금액처럼 사용자가 이해하기 쉬운 짧은 이름."
                },
                value: {
                  type: "string",
                  description: "원문에 적힌 값을 단위와 함께 그대로 가깝게 추출한다."
                },
                page: {
                  type: "integer",
                  description: "값의 근거가 있는 1부터 시작하는 페이지 번호. 찾지 못하면 0."
                },
                quote: {
                  type: "string",
                  description: "값을 직접 포함하거나 뒷받침하는 짧은 원문 인용. 없으면 빈 문자열."
                }
              },
              required: ["field_type", "label", "value", "page", "quote"]
            }
          }
        },
        required: ["document_title", "received_reason", "important_impact", "cautions", "fields"]
      }
    }
  };

def unsupported_schema:
  {
    type: "json_schema",
    json_schema: {
      name: "unsupported_understanding",
      schema: {
        type: "object",
        properties: {
          document_title: {
            type: "string",
            description: "문서 첫 페이지의 대표 제목만 추출한다. 없으면 빈 문자열."
          },
          source_only_explanation: {
            type: "string",
            description: "지원하지 않는 문서가 무엇을 말하는지 원문에 근거해 최대 두 문장으로만 설명한다. 행동 지시나 추론은 넣지 않는다."
          }
        },
        required: ["document_title", "source_only_explanation"]
      }
    }
  };

.agentConfig.informationExtractConfiguration.schemas = [
  supported_schema("bill_understanding"; "고지서"),
  supported_schema("public_notice_understanding"; "공공기관 통지서"),
  supported_schema("insurance_finance_understanding"; "보험·금융 안내문"),
  unsupported_schema
]
| .exportedAt = (now | todateiso8601)
