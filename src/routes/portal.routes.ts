import { Router } from "express";
import {
  adminAssessmentController,
  adminAssessmentsController,
  adminCertificatesController,
  adminCourseController,
  adminCoursesController,
  adminDashboardController,
  adminEnrollmentsController,
  adminResultsController,
  adminUserController,
  adminUsersController,
  assessmentHistoryController,
  catalogController,
  categoriesController,
  certificateHistoryController,
  certificatePdfController,
  completeLessonController,
  coursePlayerController,
  courseThumbnailController,
  createAssessmentController,
  createCategoryController,
  createCourseController,
  createLessonController,
  createModuleController,
  createQuestionController,
  deleteAssessmentController,
  deleteCategoryController,
  deleteCourseController,
  deleteLessonController,
  deleteModuleController,
  deleteQuestionController,
  documentAccessController,
  enrollController,
  mediaController,
  myAssessmentsController,
  myCertificatesController,
  myLearningController,
  profileController,
  profilePhotoController,
  readAttemptController,
  reassignAssessmentController,
  regenerateCertificateController,
  reorderLessonsController,
  reorderModulesController,
  reportExportController,
  reportsController,
  startAttemptController,
  submitAttemptController,
  updateAssessmentController,
  updateCategoryController,
  updateCourseController,
  updateLessonController,
  updateModuleController,
  updateQuestionController,
  updateUserCoursesController,
  upload,
  uploadError,
  userCoursesController,
  userDashboardController,
  userStatusController,
  verifyCertificateController,
} from "../controllers/portal.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const portalRouter = Router();

portalRouter.get("/certificates/verify/:code", verifyCertificateController);
portalRouter.get(["/media/:filename", "/media/{*filename}"], authenticate, mediaController);
portalRouter.get("/documents/:userFolder/:filename", authenticate, documentAccessController);
portalRouter.get("/public/documents/:userFolder/:filename", authenticate, documentAccessController);
portalRouter.get(
  "/courses",
  authenticate,
  authorize("USER", "ADMIN"),
  adminCoursesController
);

const learner = Router();
learner.use(authenticate, authorize("USER"));
learner.get("/dashboard", userDashboardController);
learner.patch("/profile", profileController);
learner.post("/profile/photo", upload.single("photo"), uploadError, profilePhotoController);
learner.get("/catalog", catalogController);
learner.post("/enrollments", enrollController);
learner.get("/learning", myLearningController);
learner.get("/learning/:courseId", coursePlayerController);
learner.post("/lessons/:lessonId/complete", completeLessonController);
learner.get("/assessments", myAssessmentsController);
learner.get("/assessments/:assessmentId/results", assessmentHistoryController);
learner.post("/assessments/:assessmentId/start", startAttemptController);
learner.get("/attempts/:attemptId", readAttemptController);
learner.post("/attempts/:attemptId/submit", submitAttemptController);
learner.get("/certificates", myCertificatesController);
learner.get("/certificates/:certificateId/pdf", certificatePdfController);

const admin = Router();

admin.use(authenticate);
admin.get(
  "/courses",
  authorize("USER", "ADMIN"),
  adminCoursesController
);

admin.use(authorize("ADMIN"));
admin.get("/dashboard", adminDashboardController);
admin.get("/categories", categoriesController);
admin.post("/categories", createCategoryController);
admin.patch("/categories/:categoryId", updateCategoryController);
admin.delete("/categories/:categoryId", deleteCategoryController);
// admin.get("/courses", adminCoursesController);
admin.post("/courses", createCourseController);
admin.get("/courses/:courseId", adminCourseController);
admin.patch("/courses/:courseId", updateCourseController);
admin.post("/courses/:courseId/thumbnail", upload.single("thumbnail"), uploadError, courseThumbnailController);
admin.delete("/courses/:courseId", deleteCourseController);
admin.post("/courses/:courseId/modules", createModuleController);
admin.patch("/modules/:moduleId", updateModuleController);
admin.delete("/modules/:moduleId", deleteModuleController);
admin.post("/courses/:courseId/modules/order", reorderModulesController);
admin.post("/modules/:moduleId/lessons", upload.single("file"), uploadError, createLessonController);
admin.patch("/lessons/:lessonId", upload.single("file"), uploadError, updateLessonController);
admin.delete("/lessons/:lessonId", deleteLessonController);
admin.post("/modules/:moduleId/lessons/order", reorderLessonsController);
admin.get("/assessments", adminAssessmentsController);
admin.post("/assessments", createAssessmentController);
admin.get("/assessments/:assessmentId", adminAssessmentController);
admin.patch("/assessments/:assessmentId", updateAssessmentController);
admin.delete("/assessments/:assessmentId", deleteAssessmentController);
admin.post("/assessments/:assessmentId/questions", createQuestionController);
admin.patch("/questions/:questionId", updateQuestionController);
admin.delete("/questions/:questionId", deleteQuestionController);
admin.get("/results", adminResultsController);
admin.get("/users", adminUsersController);
admin.get("/users/:userId", adminUserController);
admin.get("/users/:userId/courses", userCoursesController);
admin.patch("/users/:userId/courses", updateUserCoursesController);
admin.patch("/users/:userId/status", userStatusController);
admin.post("/users/:userId/assessments/:assessmentId/reassign", reassignAssessmentController);
admin.get("/enrollments", adminEnrollmentsController);
admin.get("/certificates", adminCertificatesController);
admin.get("/certificates/:certificateId/pdf", certificatePdfController);
admin.post("/certificates/:certificateId/regenerate", regenerateCertificateController);
admin.get("/certificates/:certificateId/history", certificateHistoryController);
admin.get("/reports", reportsController);
admin.get("/reports/export", reportExportController);

portalRouter.use("/me", learner);
portalRouter.use("/admin", admin);

export default portalRouter;
