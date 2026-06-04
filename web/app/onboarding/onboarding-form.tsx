"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  calculateNutritionRecommendation,
  saveOnboardingData,
  getUserSettings,
  type OnboardingData,
  type NutritionRecommendation,
} from "@/app/actions/onboarding"
import {
  User,
  Ruler,
  Dumbbell,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Flame,
  Beef,
  Wheat,
  Droplet,
  Zap,
} from "lucide-react"

const TOTAL_STEPS = 3

const GENDER_OPTIONS = [
  { value: "male", label: "男性", icon: "👨" },
  { value: "female", label: "女性", icon: "👩" },
] as const

const ACTIVITY_OPTIONS = [
  {
    value: "sedentary",
    label: "久坐",
    description: "几乎不运动",
    icon: "🪑",
  },
  {
    value: "light",
    label: "轻度活动",
    description: "每周运动1-3天",
    icon: "🚶",
  },
  {
    value: "moderate",
    label: "中度活动",
    description: "每周运动3-5天",
    icon: "🏃",
  },
  {
    value: "heavy",
    label: "重度活动",
    description: "每周运动6-7天",
    icon: "💪",
  },
] as const

export default function OnboardingForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userId, isLoaded } = useAuth()
  const { user } = useUser()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [recommendation, setRecommendation] = useState<NutritionRecommendation | null>(null)
  const [isReassess, setIsReassess] = useState(false)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)

  const [formData, setFormData] = useState<OnboardingData>({
    gender: "male",
    age: 25,
    height: 170,
    weight: 65,
    activityLevel: "moderate",
  })

  useEffect(() => {
    setIsReassess(searchParams.get("reassess") === "true")
  }, [searchParams])

  useEffect(() => {
    if (isLoaded && userId && isReassess) {
      const loadUserSettings = async () => {
        setIsLoadingSettings(true)
        const settings = await getUserSettings(userId)
        if (settings) {
          setFormData({
            gender: (settings.gender as "male" | "female") || "male",
            age: settings.age || 25,
            height: settings.height || 170,
            weight: settings.weight || 65,
            activityLevel: (settings.activity_level as OnboardingData["activityLevel"]) || "moderate",
          })
        }
        setIsLoadingSettings(false)
      }
      loadUserSettings()
    } else {
      setIsLoadingSettings(false)
    }
  }, [isLoaded, userId, isReassess])

  useEffect(() => {
    if (isLoaded && !userId) {
      router.push("/sign-in")
    }
  }, [isLoaded, userId, router])

  const updateFormData = <K extends keyof OnboardingData>(
    key: K,
    value: OnboardingData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleCalculateRecommendation = async () => {
    setIsCalculating(true)
    try {
      const result = await calculateNutritionRecommendation(formData)
      if (result.success && result.recommendation) {
        setRecommendation(result.recommendation)
      }
    } catch (error) {
      console.error("Failed to calculate recommendation:", error)
    } finally {
      setIsCalculating(false)
    }
  }

  useEffect(() => {
    if (currentStep === 3 && !recommendation) {
      handleCalculateRecommendation()
    }
  }, [currentStep])

  const handleSubmit = async () => {
    if (!userId || !recommendation) return

    setIsLoading(true)
    try {
      const result = await saveOnboardingData(userId, formData, recommendation)
      if (result.success) {
        router.push("/")
      } else {
        console.error("Failed to save:", result.error)
      }
    } catch (error) {
      console.error("Submit error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const progress = (currentStep / TOTAL_STEPS) * 100

  const stepIcons = [User, Ruler, Sparkles]
  const stepTitles = ["基本信息", "身体数据", "营养目标"]

  if (!isLoaded || isLoadingSettings) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary shadow-lg shadow-primary/30">
                <Zap className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
              </div>
              <span className="font-bold text-xl tracking-tight text-foreground">FitCore</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {isReassess ? "重新评估营养目标" : `欢迎加入，${user?.firstName || "健身达人"}！`}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isReassess ? "更新你的身体数据，获取最新的营养建议" : "让我们为你定制专属的健身计划"}
            </p>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              {stepTitles.map((title, index) => {
                const Icon = stepIcons[index]
                const stepNum = index + 1
                const isActive = currentStep === stepNum
                const isCompleted = currentStep > stepNum

                return (
                  <div
                    key={stepNum}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all",
                        isActive && "bg-primary text-primary-foreground",
                        isCompleted && "bg-primary/20 text-primary",
                        !isActive && !isCompleted && "bg-secondary text-muted-foreground"
                      )}
                    >
                      {isCompleted ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    {index < stepTitles.length - 1 && (
                      <div
                        className={cn(
                          "w-16 h-0.5 rounded-full transition-all",
                          currentStep > stepNum ? "bg-primary" : "bg-secondary"
                        )}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          <div className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-lg">
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-1">基本信息</h2>
                  <p className="text-sm text-muted-foreground">请告诉我们你的性别和年龄</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-3 block">性别</label>
                    <div className="grid grid-cols-2 gap-3">
                      {GENDER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateFormData("gender", option.value)}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-xl border-2 transition-all",
                            formData.gender === option.value
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50"
                          )}
                        >
                          <span className="text-2xl">{option.icon}</span>
                          <span className="font-medium">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">年龄</label>
                    <Input
                      type="number"
                      value={formData.age}
                      onChange={(e) => updateFormData("age", parseInt(e.target.value) || 0)}
                      placeholder="请输入年龄"
                      className="h-12 text-base"
                      min={10}
                      max={100}
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-1">身体数据</h2>
                  <p className="text-sm text-muted-foreground">这些数据将用于计算你的营养目标</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">身高</label>
                    <Input
                      type="number"
                      value={formData.height}
                      onChange={(e) => updateFormData("height", parseInt(e.target.value) || 0)}
                      placeholder="请输入身高"
                      className="h-12 text-base"
                      min={100}
                      max={250}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">体重</label>
                    <Input
                      type="number"
                      value={formData.weight}
                      onChange={(e) => updateFormData("weight", parseInt(e.target.value) || 0)}
                      placeholder="请输入体重"
                      className="h-12 text-base"
                      min={30}
                      max={300}
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-1">运动习惯</h2>
                  <p className="text-sm text-muted-foreground">选择最符合你当前运动水平的选项</p>
                </div>

                <div className="space-y-3">
                  {ACTIVITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateFormData("activityLevel", option.value as OnboardingData["activityLevel"])}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                        formData.activityLevel === option.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <div className="flex-1">
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                      {formData.activityLevel === option.value && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {isCalculating ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
                    <span className="text-muted-foreground">AI 正在为你计算营养目标...</span>
                  </div>
                ) : recommendation ? (
                  <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-5 h-5 text-primary" />
                      <span className="font-bold text-foreground">AI 推荐目标</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-card/80 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Flame className="w-4 h-4 text-primary" />
                          <span className="text-xs text-muted-foreground">每日热量</span>
                        </div>
                        <div className="text-xl font-bold text-foreground">{recommendation.targetCalories}</div>
                        <div className="text-xs text-muted-foreground">kcal</div>
                      </div>

                      <div className="bg-card/80 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Beef className="w-4 h-4 text-red-400" />
                          <span className="text-xs text-muted-foreground">蛋白质</span>
                        </div>
                        <div className="text-xl font-bold text-foreground">{recommendation.targetProtein}g</div>
                        <div className="text-xs text-muted-foreground">每日目标</div>
                      </div>

                      <div className="bg-card/80 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Wheat className="w-4 h-4 text-amber-400" />
                          <span className="text-xs text-muted-foreground">碳水化合物</span>
                        </div>
                        <div className="text-xl font-bold text-foreground">{recommendation.targetCarbs}g</div>
                        <div className="text-xs text-muted-foreground">每日目标</div>
                      </div>

                      <div className="bg-card/80 rounded-lg p-3 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Droplet className="w-4 h-4 text-yellow-400" />
                          <span className="text-xs text-muted-foreground">脂肪</span>
                        </div>
                        <div className="text-xl font-bold text-foreground">{recommendation.targetFat}g</div>
                        <div className="text-xs text-muted-foreground">每日目标</div>
                      </div>
                    </div>

                    <div className="bg-card/60 rounded-lg p-3">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {recommendation.aiAdvice}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>基础代谢: {recommendation.bmr} kcal</span>
                      <span>每日消耗: {recommendation.tdee} kcal</span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                上一步
              </Button>

              {currentStep < TOTAL_STEPS ? (
                <Button onClick={handleNext} className="gap-1">
                  下一步
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isLoading || !recommendation}
                  className="gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {isReassess ? "保存更新" : "开始健身之旅"}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
