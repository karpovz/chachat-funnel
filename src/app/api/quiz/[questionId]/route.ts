import { body, endpoint, guardOrigin, ok } from "@/server/http";
import { answerQuestion } from "@/server/funnel";
import { questionIdSchema, quizAnswerInputSchema } from "@/shared/contracts";
export async function PUT(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  return endpoint("quiz.answer", async () => {
    guardOrigin(request);
    return ok(
      await answerQuestion(
        questionIdSchema.parse((await context.params).questionId),
        await body(request, quizAnswerInputSchema),
      ),
    );
  });
}
