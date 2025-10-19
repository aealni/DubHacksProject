export interface PersonalizedPracticeRequest {
  prompt: string;
  context?: string;
}

export interface PersonalizedPracticeSuccess {
  success: true;
  content: string;
}

export interface PersonalizedPracticeFailure {
  success: false;
  error: string;
}

export type PersonalizedPracticeResponse =
  | PersonalizedPracticeSuccess
  | PersonalizedPracticeFailure;

export async function requestPersonalizedPracticeQuiz(
  payload: PersonalizedPracticeRequest
): Promise<PersonalizedPracticeResponse> {
  try {
    const response = await fetch('/api/personalized-practice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = typeof data?.error === 'string' ? data.error : 'Unable to generate practice quiz.';
      return { success: false, error: errorMessage };
    }

    if (typeof data?.content !== 'string') {
      return { success: false, error: 'Practice quiz response was incomplete.' };
    }

    return {
      success: true,
      content: data.content
    };
  } catch (error) {
    console.error('[practiceQuiz] Request failed', error);
    return {
      success: false,
      error: 'Network error: could not reach the practice quiz service.'
    };
  }
}
